import { randomUUID } from 'node:crypto';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Config, r2Client } from '../lib/r2.js';
if (process.env.VERCEL_ENV==='production') {
 const config=r2Config();if(!config)throw Error('PRIVATE_STORAGE_NOT_CONFIGURED');
 const client=r2Client(config),key='olhan/verification/'+randomUUID(),body=Buffer.from('Olhan storage verification');let created=false;
 try {
  await client.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:body,ContentType:'text/plain'}),{abortSignal:AbortSignal.timeout(10000)});created=true;
  const object=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
  if(!Buffer.from(await object.Body.transformToByteArray()).equals(body))throw Error('PRIVATE_STORAGE_VERIFICATION_FAILED');
  console.info('PRIVATE_STORAGE_ROUNDTRIP_OK');
 }finally{if(created)await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});client.destroy();}
}
