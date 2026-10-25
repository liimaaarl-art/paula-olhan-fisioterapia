import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from '../lib/auth.js';
import { authHandler } from '../api/auth-handler.js';

test('HTTP: rotas de vários segmentos chegam ao login e à confirmação, com cookies reais',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const rewrite=config.rewrites.find(r=>r.source.includes('/api/auth/'));
  assert.ok(rewrite,'Autenticação precisa de rewrite explícito no Vercel sem framework');
  const database=new DatabaseSync(':memory:'),mails=[],jar=new Map();
  const adminEmail='owner@example.test';let auth,origin;
  const handler=authHandler({getAuthInstance:()=>auth,baseURL:()=>origin,adminEmail:()=>adminEmail});
  const server=createServer(async(req,res)=>{
    try{
      res.status=code=>{res.statusCode=code;return res};
      const url=new URL(req.url,origin),prefix=rewrite.source.split(':path*')[0];
      if(!url.pathname.startsWith(prefix)){res.statusCode=404;return res.end('NOT_FOUND')}
      req.url=rewrite.destination.replaceAll(':path*',url.pathname.slice(prefix.length));
      const routed=new URL(req.url,origin);req.query=Object.fromEntries(routed.searchParams);
      let body='';for await(const chunk of req)body+=chunk;req.body=body?JSON.parse(body):undefined;
      await handler(req,res);
    }catch{res.statusCode=500;res.end('HTTP_TEST_FAILED')}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
  auth=createAuth({database,secret:'http-integration-secret-more-than-32-characters',baseURL:origin,adminEmail,rateLimit:false,sendMail:async mail=>mails.push(mail)});
  try{
    await (await getMigrations(auth.options)).runMigrations();
    async function call(path,body){
      const response=await fetch(origin+'/api/auth/'+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},body:body===undefined?undefined:JSON.stringify(body)});
      assert.match(response.headers.get('content-type'),/application\/json/);
      for(const c of response.headers.getSetCookie()){const pair=c.split(';')[0],at=pair.indexOf('=');if(pair.slice(at+1))jar.set(pair.slice(0,at),pair.slice(at+1));else jar.delete(pair.slice(0,at));}
      return {status:response.status,data:await response.json()};
    }
    assert.equal((await call('request-password-reset',{email:adminEmail})).status,200);
    const token=new URLSearchParams(new URL(mails.at(-1).link).hash.slice(1)).get('reset');
    assert.equal((await call('reset-password',{token,newPassword:'Http-test-password-123'})).status,200);
    assert.equal((await call('sign-in/email',{email:adminEmail,password:'wrong-password'})).status,401);
    const sign=await call('sign-in/email',{email:adminEmail,password:'Http-test-password-123',rememberMe:true});
    assert.equal(sign.status,200);assert.equal(sign.data.twoFactorRedirect,true);
    assert.equal((await call('get-session')).data,null);
    assert.equal(mails.at(-1).kind,'login');
    assert.equal((await call('two-factor/verify-otp',{code:mails.at(-1).code,trustDevice:false})).status,200);
    assert.equal((await call('get-session')).data.user.email,adminEmail);
    assert.equal((await call('sign-out',{})).status,200);
    assert.equal((await call('get-session')).data,null);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));database.close()}
});
