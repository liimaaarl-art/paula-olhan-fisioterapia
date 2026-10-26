import { randomUUID } from 'node:crypto';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { protect } from '../lib/auth-guard.js';
import { r2Config, r2Client } from '../lib/r2.js';
import { db, json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';
const types=new Set(['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','application/pdf']);
export function fileHandler({sqlFactory=db,config=r2Config,clientFactory=r2Client}={}) {return async(req,res)=>{
 if(!req.olhanUser)return json(res,401,{error:'Entre na sua conta.'});
 const cfg=config();if(!cfg)return json(res,503,{error:'Armazenamento privado indisponível.'});
 const sql=sqlFactory();let client;
 try {
  if(req.method==='GET'){
   const id=req.query?.id;if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))return json(res,400,{error:'Arquivo inválido.'});
   const rows=await sql`SELECT f.* FROM public.olhan_cloud_files f JOIN public.olhan_workspace w ON w.id='olhan' WHERE f.id=${id}::uuid AND EXISTS (SELECT 1 FROM jsonb_array_elements(w.data->'files') x WHERE COALESCE(x->>'cloudId',x->>'id')=f.id::text AND x->>'patient'=f.patient_id)`;
   if(!rows.length)return json(res,404,{error:'Arquivo não encontrado no prontuário.'});
   const file=rows[0];client=clientFactory(cfg);
   const object=await client.send(new GetObjectCommand({Bucket:cfg.bucket,Key:file.object_key}),{abortSignal:AbortSignal.timeout(15000)});
   const bytes=await object.Body.transformToByteArray();
   res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
   res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(file.name));
   res.status(200);return res.end(Buffer.from(bytes));
  }
  if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
  if(!sameOrigin(req))return json(res,403,{error:'Origem não autorizada.'});
  if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
  const b=req.body||{};
  if(!types.has(b.type)||typeof b.name!=='string'||!b.name.trim()||b.name.length>240||typeof b.patient!=='string'||typeof b.base64!=='string'||b.base64.length>4194304||!b.base64||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.base64))return json(res,400,{error:'Arquivo inválido. Use PDF, imagem ou vídeo de até 3 MB.'});
  const bytes=Buffer.from(b.base64,'base64');if(!bytes.length||bytes.length>3145728)return json(res,413,{error:'Limite de 3 MB por arquivo.'});
  const state=await sql`SELECT data FROM public.olhan_workspace WHERE id='olhan'`;
  const patientExists=state[0]?.data?.patients?.some(p=>p.id===b.patient);
  // On first migration only the administrator may upload before initial state.
  if(!patientExists && !(req.olhanUser.role==='admin'&&!state.length))return json(res,404,{error:'Salve o cadastro do paciente antes de anexar.'});
  const id=randomUUID(),key='olhan/private/'+id;
  client=clientFactory(cfg);await client.send(new PutObjectCommand({Bucket:cfg.bucket,Key:key,Body:bytes,ContentType:b.type}),{abortSignal:AbortSignal.timeout(20000)});
  await sql`INSERT INTO public.olhan_cloud_files(id,patient_id,object_key,name,mime,size,uploaded_by) VALUES(${id}::uuid,${b.patient},${key},${b.name},${b.type},${bytes.length},${req.olhanUser.id})`;
  return json(res,200,{id,data:'/api/files?id='+id,name:b.name,type:b.type,size:bytes.length});
 }catch{return json(res,503,{error:'Não foi possível confirmar o arquivo no servidor. O arquivo local foi preservado.'});}finally{client?.destroy?.();}
};}
export default protect(fileHandler());
