import { randomUUID } from 'node:crypto';
import { HeadObjectCommand,GetBucketCorsCommand,PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { protect } from '../lib/auth-guard.js';
import { db,json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';
import { r2Config,r2Client } from '../lib/r2.js';
import { signedMediaUrl } from '../lib/media-sign.js';
const types=new Set(['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','application/pdf']);
export async function ensureUploadCors(client,cfg,origin){
 let rules=[];
 try{rules=(await client.send(new GetBucketCorsCommand({Bucket:cfg.bucket}))).CORSRules||[];}catch(e){if(!['NoSuchCORSConfiguration','NoSuchCORS'].includes(e.name)&&e.$metadata?.httpStatusCode!==404)throw e;}
 if(rules.some(r=>r.AllowedOrigins?.includes(origin)&&r.AllowedMethods?.includes('PUT')&&(r.AllowedHeaders?.includes('*')||r.AllowedHeaders?.includes('content-type'))))return;
 await client.send(new PutBucketCorsCommand({Bucket:cfg.bucket,CORSConfiguration:{CORSRules:[...rules,{AllowedOrigins:[origin],AllowedMethods:['PUT','GET','HEAD'],AllowedHeaders:['content-type'],ExposeHeaders:['ETag'],MaxAgeSeconds:3600}]}}));
}
export default protect(async function(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 if(!sameOrigin(req)||!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,403,{error:'Solicitação não autorizada.'});
 const cfg=r2Config();if(!cfg)return json(res,503,{error:'Armazenamento indisponível.'});
 const b=req.body||{},sql=db();let client;
 try{
  const state=await sql`SELECT data FROM public.olhan_workspace WHERE id='olhan'`;
  if(!state[0]?.data?.patients?.some(p=>p.id===b.patient))return json(res,404,{error:'Salve o cadastro do paciente primeiro.'});
  client=r2Client(cfg);
  if(b.action==='init'){
   if(!types.has(b.type)||typeof b.name!=='string'||!b.name.trim()||b.name.length>240||!Number.isSafeInteger(b.size)||b.size<1||b.size>104857600)return json(res,400,{error:'Use PDF, imagem ou vídeo MP4/WebM de até 100 MB.'});
   // Preserve existing CORS rules. Only the configured clinical app is added.
   const origin=new URL(process.env.BETTER_AUTH_URL).origin;
   if(req.headers.origin!==origin)return json(res,403,{error:'Envie arquivos pelo endereço oficial do sistema.'});
   try{await ensureUploadCors(client,cfg,origin);}catch{return json(res,503,{error:'O armazenamento precisa autorizar o envio de arquivos pelo sistema (CORS). Peça suporte à equipe.'});}
   const id=randomUUID(),key='olhan/private/'+id;
   await sql`INSERT INTO public.olhan_cloud_files_large(id,patient_id,object_key,name,mime,size,uploaded_by) VALUES(${id}::uuid,${b.patient},${key},${b.name},${b.type},${b.size},${req.olhanUser.id})`;
   return json(res,200,{id,url:await signedMediaUrl(cfg,key,{method:'PUT',type:b.type,seconds:600})});
  }
  if(b.action==='finish'&&typeof b.id==='string'&&/^[a-f0-9-]{36}$/i.test(b.id)){
   const rows=await sql`SELECT * FROM public.olhan_cloud_files_large WHERE id=${b.id}::uuid AND patient_id=${b.patient} AND uploaded_by=${req.olhanUser.id}`;
   const file=rows[0];if(!file)return json(res,404,{error:'Envio não encontrado.'});
   const head=await client.send(new HeadObjectCommand({Bucket:cfg.bucket,Key:file.object_key}));
   if(head.ContentLength!==file.size||head.ContentType!==file.mime)return json(res,400,{error:'O arquivo não corresponde ao envio. Tente novamente.'});
   await sql`UPDATE public.olhan_cloud_files_large SET ready=true WHERE id=${file.id}::uuid`;
   return json(res,200,{id:file.id,data:'/api/files?id='+file.id,name:file.name,type:file.mime,size:file.size});
  }
  return json(res,400,{error:'Operação inválida.'});
 }catch{return json(res,503,{error:'O arquivo não foi confirmado. Tente novamente.'});}finally{client?.destroy();}
});
