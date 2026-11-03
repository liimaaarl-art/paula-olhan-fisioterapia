import { randomUUID } from 'node:crypto';
import { CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand } from '@aws-sdk/client-s3';
import { protect } from '../lib/auth-guard.js';
import { db,json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';
import { r2Config,r2Client } from '../lib/r2.js';
const types=new Set(['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','application/pdf']);
const CHUNK=2097152,PART=CHUNK*3;
const chunkKey=(f,n)=>'olhan/private-upload/'+f.id+'/'+n;
export async function mediaUploadHandler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 if(!sameOrigin(req)||!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,403,{error:'Solicitação não autorizada.'});
 const cfg=r2Config();if(!cfg)return json(res,503,{error:'Armazenamento indisponível.'});
 const b=req.body||{},sql=db();let client;
 try{
  const state=await sql`SELECT data FROM public.olhan_workspace WHERE id='olhan'`;
  if(!state[0]?.data?.patients?.some(p=>p.id===b.patient))return json(res,404,{error:'Salve o cadastro do paciente primeiro.'});
  client=r2Client(cfg);const send=command=>client.send(command,{abortSignal:AbortSignal.timeout(45000)});
  if(b.action==='init'){
   if(!types.has(b.type)||typeof b.name!=='string'||!b.name.trim()||b.name.length>240||!Number.isSafeInteger(b.size)||b.size<1||b.size>52428800)return json(res,400,{error:'Use PDF, imagem ou vídeo MP4/WebM de até 50 MB.'});
   const id=randomUUID(),key='olhan/private/'+id;
   const upload=await send(new CreateMultipartUploadCommand({Bucket:cfg.bucket,Key:key,ContentType:b.type}));
   await sql`INSERT INTO public.olhan_cloud_files_large(id,patient_id,object_key,name,mime,size,uploaded_by,upload_id) VALUES(${id}::uuid,${b.patient},${key},${b.name},${b.type},${b.size},${req.olhanUser.id},${upload.UploadId})`;
   return json(res,200,{id,chunkSize:CHUNK,chunks:Math.ceil(b.size/CHUNK)});
  }
  if(typeof b.id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.id))return json(res,400,{error:'Envio inválido.'});
  const rows=await sql`SELECT * FROM public.olhan_cloud_files_large WHERE id=${b.id}::uuid AND patient_id=${b.patient} AND uploaded_by=${req.olhanUser.id}`;
  const f=rows[0];if(!f)return json(res,404,{error:'Envio não encontrado.'});
  if(f.ready){if(b.action!=='finish')return json(res,409,{error:'O envio já foi concluído.'});return json(res,200,{id:f.id,data:'/api/files?id='+f.id,name:f.name,type:f.mime,size:f.size});}
  if(!f.upload_id||Date.now()-new Date(f.created_at).getTime()>86400000)return json(res,400,{error:'O envio venceu. Selecione o arquivo novamente.'});
  const chunks=Math.ceil(f.size/CHUNK),parts=Math.ceil(f.size/PART);
  if(b.action==='chunk'){
   if(!Number.isInteger(b.index)||b.index<0||b.index>=chunks||typeof b.base64!=='string'||b.base64.length>2796204||(b.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64)))return json(res,400,{error:'Parte inválida.'});
   const bytes=Buffer.from(b.base64,'base64');if(bytes.length!==Math.min(CHUNK,f.size-b.index*CHUNK))return json(res,400,{error:'Tamanho da parte inválido.'});
   await send(new PutObjectCommand({Bucket:cfg.bucket,Key:chunkKey(f,b.index),Body:bytes,ContentType:'application/octet-stream'}));return json(res,200,{ok:true});
  }
  if(b.action==='assemble'){
   if(!Number.isInteger(b.part)||b.part<0||b.part>=parts)return json(res,400,{error:'Parte inválida.'});
   const buffers=[];for(let i=b.part*3;i<Math.min(chunks,b.part*3+3);i++){const object=await send(new GetObjectCommand({Bucket:cfg.bucket,Key:chunkKey(f,i)}));const bytes=Buffer.from(await object.Body.transformToByteArray());if(bytes.length!==Math.min(CHUNK,f.size-i*CHUNK))throw Error('CHUNK_SIZE');buffers.push(bytes);}
   const part=await send(new UploadPartCommand({Bucket:cfg.bucket,Key:f.object_key,UploadId:f.upload_id,PartNumber:b.part+1,Body:Buffer.concat(buffers)}));
   await sql`UPDATE public.olhan_cloud_files_large SET parts=parts || jsonb_build_object(${String(b.part+1)}::text,${part.ETag}::text) WHERE id=${f.id}::uuid AND NOT ready`;
   return json(res,200,{ok:true});
  }
  if(b.action==='finish'){
   const list=[];for(let i=1;i<=parts;i++){if(typeof f.parts?.[String(i)]!=='string')return json(res,400,{error:'O envio ainda não está completo.'});list.push({PartNumber:i,ETag:f.parts[String(i)]});}
   await send(new CompleteMultipartUploadCommand({Bucket:cfg.bucket,Key:f.object_key,UploadId:f.upload_id,MultipartUpload:{Parts:list}}));
   await sql`UPDATE public.olhan_cloud_files_large SET ready=true,upload_id=NULL WHERE id=${f.id}::uuid`;
   // Delete only temporary chunks of this upload, never a patient document.
   for(let i=0;i<chunks;i++)try{await send(new DeleteObjectCommand({Bucket:cfg.bucket,Key:chunkKey(f,i)}));}catch{}
   return json(res,200,{id:f.id,data:'/api/files?id='+f.id,name:f.name,type:f.mime,size:f.size});
  }
  if(b.action==='abort'){
   await send(new AbortMultipartUploadCommand({Bucket:cfg.bucket,Key:f.object_key,UploadId:f.upload_id}));
   for(let i=0;i<chunks;i++)try{await send(new DeleteObjectCommand({Bucket:cfg.bucket,Key:chunkKey(f,i)}));}catch{}
   await sql`UPDATE public.olhan_cloud_files_large SET upload_id=NULL WHERE id=${f.id}::uuid AND NOT ready`;return json(res,200,{ok:true});
  }
  return json(res,400,{error:'Operação inválida.'});
 }catch{return json(res,503,{error:'O arquivo não foi confirmado. Tente novamente.'});}finally{client?.destroy();}
}
export default protect(mediaUploadHandler);
