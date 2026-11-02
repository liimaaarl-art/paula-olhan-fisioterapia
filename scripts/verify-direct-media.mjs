import { randomUUID } from 'node:crypto';
import { CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,GetObjectCommand,PutObjectCommand,DeleteObjectCommand,AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { r2Config,r2Client } from '../lib/r2.js';
import { signedMediaUrl } from '../lib/media-sign.js';
const cfg=r2Config();if(!cfg)throw Error('Private media storage is not configured');
const client=r2Client(cfg),key='olhan/private-storage-checks/'+randomUUID(),bytes=Buffer.alloc(8*1024*1024,65),chunks=Array.from({length:4},(_,i)=>key+'/'+i);let upload,finished=false;
try{
 upload=await client.send(new CreateMultipartUploadCommand({Bucket:cfg.bucket,Key:key,ContentType:'video/mp4'}));
 for(let i=0;i<4;i++)await client.send(new PutObjectCommand({Bucket:cfg.bucket,Key:chunks[i],Body:bytes.subarray(i*2097152,(i+1)*2097152)}));
 const parts=[];for(let group=0;group<2;group++){const buffers=[];for(const chunk of chunks.slice(group*3,group*3+3)){const item=await client.send(new GetObjectCommand({Bucket:cfg.bucket,Key:chunk}));buffers.push(Buffer.from(await item.Body.transformToByteArray()));}
 const part=await client.send(new UploadPartCommand({Bucket:cfg.bucket,Key:key,UploadId:upload.UploadId,PartNumber:group+1,Body:Buffer.concat(buffers)}));parts.push({PartNumber:group+1,ETag:part.ETag});}
 await client.send(new CompleteMultipartUploadCommand({Bucket:cfg.bucket,Key:key,UploadId:upload.UploadId,MultipartUpload:{Parts:parts}}));finished=true;
 const get=await fetch(await signedMediaUrl(cfg,key),{signal:AbortSignal.timeout(30000)});if(!get.ok||(await get.arrayBuffer()).byteLength!==bytes.length)throw Error('Private media read verification failed');
 console.log('PRIVATE_MEDIA_CHECK_PASSED: multipart upload over 3 MB and signed private read. No CORS or public bucket change.');
}finally{if(upload&&!finished)await client.send(new AbortMultipartUploadCommand({Bucket:cfg.bucket,Key:key,UploadId:upload.UploadId})).catch(()=>{});for(const k of [...chunks,key])await client.send(new DeleteObjectCommand({Bucket:cfg.bucket,Key:k})).catch(()=>{});client.destroy();}
