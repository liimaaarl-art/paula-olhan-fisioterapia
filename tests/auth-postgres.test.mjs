import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../lib/auth.js';
import { authRequest } from '../lib/auth-route.js';
import { getMigrations } from 'better-auth/db/migration';

test('Postgres isolado: esquema compatível, senha + confirmação, sessão e recuperação', { skip: !process.env.AUTH_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({connectionString:process.env.AUTH_TEST_DATABASE_URL,max:2});
  const baseURL='http://localhost:3000',adminEmail='dev-test-'+randomUUID()+'@example.test',mails=[],jar=new Map();
  const auth=createAuth({database:pool,secret:'postgres-integration-test-secret-longer-than-32',baseURL,adminEmail,rateLimit:true,sendMail:async mail=>mails.push(mail)});
  try {
    const plan=await getMigrations(auth.options);
    assert.deepEqual(plan.toBeCreated,[]);assert.deepEqual(plan.toBeAdded,[]);assert.deepEqual(plan.unsafeChanges,[]);assert.deepEqual(plan.schemaProblems,[]);
    async function call(path,body){
      const headers={origin:baseURL,'content-type':'application/json',cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),'x-forwarded-for':'192.0.2.81'};
      const response=await authRequest(new Request(baseURL+'/api/auth/'+path,{headers,method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body)}),auth,{baseURL,adminEmail});
      for(const c of response.headers.getSetCookie()){const pair=c.split(';')[0],at=pair.indexOf('=');if(pair.slice(at+1))jar.set(pair.slice(0,at),pair.slice(at+1));else jar.delete(pair.slice(0,at));}
      return {status:response.status,data:await response.json()};
    }
    assert.equal((await call('request-password-reset',{email:adminEmail})).status,200);
    const token=new URLSearchParams(new URL(mails.at(-1).link).hash.slice(1)).get('reset');
    assert.equal((await call('reset-password',{token,newPassword:'Postgres-test-password-123'})).status,200);
    assert.equal((await call('sign-in/email',{email:adminEmail,password:'Postgres-test-password-123'})).data.twoFactorRedirect,true);
    assert.equal((await call('get-session')).data,null);
    assert.equal((await call('two-factor/verify-otp',{code:mails.at(-1).code,trustDevice:false})).status,200);
    assert.equal((await call('get-session')).data.user.email,adminEmail);
    assert.equal((await call('sign-out',{})).status,200);assert.equal((await call('get-session')).data,null);
  } finally { await pool.end(); }
});
