import { createHash,createHmac } from 'node:crypto';
import { SignatureV4 } from '@smithy/signature-v4';
class Sha256 {constructor(secret){this.hash=secret?createHmac('sha256',secret):createHash('sha256');}update(data){this.hash.update(data);}async digest(){return this.hash.digest();}}
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export async function signedMediaUrl(cfg,key,{method='GET',type,seconds=120}={}){
 const endpoint=new URL(cfg.endpoint),headers={host:endpoint.host,'x-amz-content-sha256':'UNSIGNED-PAYLOAD'};
 if(type)headers['content-type']=type;
 const signer=new SignatureV4({service:'s3',region:'auto',credentials:cfg.credentials,sha256:Sha256,uriEscapePath:false});
 const request=await signer.presign({method,protocol:'https:',hostname:endpoint.hostname,path:'/'+cfg.bucket+'/'+key.split('/').map(enc).join('/'),headers,query:{}},{expiresIn:seconds});
 const query=Object.entries(request.query).flatMap(([k,v])=>(Array.isArray(v)?v:[v]).map(value=>enc(k)+'='+enc(String(value)))).join('&');
 return cfg.endpoint+request.path+'?'+query;
}
