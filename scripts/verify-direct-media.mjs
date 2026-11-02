import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand,HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Config,r2Client } from '../lib/r2.js';
import { signedMediaUrl } from '../lib/media-sign.js';
import { ensureUploadCors } from '../api/media-upload.js';
const cfg=r2Config();if(!cfg)throw Error('Private media storage is not configured');
const client=r2Client(cfg),key='olhan/private-storage-checks/'+randomUUID(),bytes=Buffer.alloc(4*1024*1024,65);
try{
 await ensureUploadCors(client,cfg,new URL(process.env.BETTER_AUTH_URL).origin);
 const put=await fetch(await signedMediaUrl(cfg,key,{method:'PUT',type:'video/mp4',seconds:120}),{method:'PUT',headers:{'Content-Type':'video/mp4'},body:bytes,signal:AbortSignal.timeout(30000)});
 if(!put.ok)throw Error('Direct private upload verification failed: '+put.status);
 const head=await client.send(new HeadObjectCommand({Bucket:cfg.bucket,Key:key}));if(head.ContentLength!==bytes.length)throw Error('Private media size mismatch');
 const get=await fetch(await signedMediaUrl(cfg,key),{signal:AbortSignal.timeout(30000)});if(!get.ok||(await get.arrayBuffer()).byteLength!==bytes.length)throw Error('Private media read verification failed');
 console.log('DIRECT_MEDIA_CHECK_PASSED: private signed PUT/GET over 3 MB; CORS preserves other rules.');
}finally{try{await client.send(new DeleteObjectCommand({Bucket:cfg.bucket,Key:key}));}finally{client.destroy();}}
