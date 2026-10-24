import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth, adminSession, REMEMBER_SESSION_SECONDS, SHORT_SESSION_SECONDS } from '../lib/auth.js';
import { authRequest } from '../lib/auth-route.js';
import { protect } from '../lib/auth-guard.js';
import { smtpConfig } from '../lib/auth-mail.js';

const baseURL = 'http://localhost:3000', adminEmail = 'owner@example.test';
const password = 'Somente-teste-123!';
async function fixture({ rateLimit = false, failMail = false } = {}) {
  const database = new DatabaseSync(':memory:'), mails = [], jar = new Map();
  const auth = createAuth({ database, secret: 'a-random-test-secret-that-is-over-32-characters', baseURL, adminEmail, rateLimit,
    sendMail: async mail => { if (failMail) throw Error('private-smtp-error'); mails.push(mail); } });
  await (await getMigrations(auth.options)).runMigrations();
  const cookie = () => [...jar].map(([k,v]) => k + '=' + v).join('; ');
  async function request(path, body, { origin = baseURL, cookies = cookie() } = {}) {
    const headers = { origin, cookie: cookies, 'content-type':'application/json', 'x-forwarded-for':'127.0.0.1' };
    const response = await authRequest(new Request(baseURL + '/api/auth/' + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }), auth, { baseURL, adminEmail });
    for (const c of response.headers.getSetCookie()) { const pair=c.split(';')[0], at=pair.indexOf('='); const key=pair.slice(0,at), value=pair.slice(at+1); if(value)jar.set(key,value);else jar.delete(key); }
    const data = await response.json();
    return { status: response.status, data, headers: response.headers };
  }
  const reset = () => request('request-password-reset', { email: adminEmail });
  const setPassword = async () => { await reset(); const token = new URLSearchParams(new URL(mails.at(-1).link).hash.slice(1)).get('reset'); return request('reset-password', { token, newPassword:password }); };
  const signin = (rememberMe = false) => request('sign-in/email', { email:adminEmail,password,rememberMe });
  const verify = () => request('two-factor/verify-otp', { code:mails.at(-1).code,trustDevice:false });
  return { database, auth, request, mails, cookie, reset, setPassword, signin, verify };
}

test('primeiro acesso: somente e-mail reservado recebe conta; senha nunca é gerada/enviada', async () => {
  const f=await fixture();
  assert.equal((await f.request('request-password-reset',{email:'stranger@example.test'})).status,200);
  assert.equal(f.mails.length,0);
  assert.equal(f.database.prepare('select count(*) as n from olhan_auth_user').get().n,0);
  await f.reset(); const user=f.database.prepare('select * from olhan_auth_user').get();
  assert.equal(user.role,'admin'); assert.equal(user.twoFactorEnabled,1); assert.equal(user.emailVerified,0);
  assert.equal(f.mails[0].kind,'reset'); assert.ok(!JSON.stringify(f.mails).includes(password));
  assert.equal(f.database.prepare('select count(*) as n from olhan_auth_account').get().n,0);
  assert.equal((await f.request('sign-up/email',{email:adminEmail,password,name:'Fake',role:'admin'})).status,404);
});
test('endereço antigo cadastrado não recebe convite e perfil revogado não é reativado',async()=>{
  const f=await fixture(),ctx=await f.auth.$context;
  await ctx.internalAdapter.createUser({email:'old-address@example.test',name:'Retired',emailVerified:false});
  assert.equal((await f.request('request-password-reset',{email:'old-address@example.test'})).status,200);
  assert.equal(f.mails.length,0);
  await f.reset();assert.equal(f.mails.length,1);
  const account=await ctx.internalAdapter.findUserByEmail(adminEmail);
  await ctx.internalAdapter.updateUser(account.user.id,{role:'revoked'});
  assert.equal((await f.reset()).status,200);assert.equal(f.mails.length,1);
  assert.equal((await ctx.internalAdapter.findUserByEmail(adminEmail)).user.role,'revoked');
});
test('link de senha continua válido após 23 horas e só pode ser usado uma vez',async()=>{
  const f=await fixture();await f.reset();
  const token=new URLSearchParams(new URL(f.mails.at(-1).link).hash.slice(1)).get('reset');
  const row=f.database.prepare('select * from olhan_auth_verification').get();
  assert.ok(Math.abs(new Date(row.expiresAt)-new Date(row.createdAt)-24*60*60*1000)<1000);
  const age=23*60*60*1000;
  f.database.prepare('update olhan_auth_verification set createdAt=?,expiresAt=? where id=?').run(new Date(new Date(row.createdAt)-age).toISOString(),new Date(new Date(row.expiresAt)-age).toISOString(),row.id);
  assert.equal((await f.request('reset-password',{token,newPassword:password})).status,200);
  assert.equal((await f.request('reset-password',{token,newPassword:password})).status,400);
  assert.equal((await f.request('get-session')).data,null);
});
test('link de senha vencido após 24 horas não permite definir senha',async()=>{
  const f=await fixture();await f.reset();
  const token=new URLSearchParams(new URL(f.mails.at(-1).link).hash.slice(1)).get('reset');
  const row=f.database.prepare('select * from olhan_auth_verification').get(),age=24*60*60*1000+1000;
  f.database.prepare('update olhan_auth_verification set createdAt=?,expiresAt=? where id=?').run(new Date(new Date(row.createdAt)-age).toISOString(),new Date(new Date(row.expiresAt)-age).toISOString(),row.id);
  assert.equal((await f.request('reset-password',{token,newPassword:password})).status,400);
  assert.equal(f.database.prepare('select count(*) as n from olhan_auth_account').get().n,0);
});
test('senha correta não libera sessão; link/código é vinculado ao navegador e de uso único', async () => {
  const f=await fixture(); assert.equal((await f.setPassword()).status,200);
  const sign=await f.signin(); assert.equal(sign.status,200); assert.equal(sign.data.twoFactorRedirect,true); assert.equal(sign.data.token,undefined);
  assert.equal((await f.request('get-session')).data,null);
  assert.equal(f.database.prepare('select count(*) as n from olhan_auth_session').get().n,0);
  assert.equal(f.mails.at(-1).kind,'login'); assert.equal(new URL(f.mails.at(-1).link).hash,'#confirm='+f.mails.at(-1).code);
  const code=f.mails.at(-1).code;
  assert.equal((await f.request('two-factor/verify-otp',{code},{cookies:''})).status,401);
  assert.equal((await f.verify()).status,200);
  const session=(await f.request('get-session')).data; assert.equal(session.user.email,adminEmail); assert.equal(session.user.role,'admin');
  assert.ok(!JSON.stringify(session).includes('token'));
  assert.ok(await adminSession(new Headers({cookie:f.cookie()}),f.auth,adminEmail));
  const rawCookie=f.cookie(); await f.request('sign-out',{});
  assert.equal((await f.request('get-session',undefined,{cookies:rawCookie})).data,null);
  await f.signin(); assert.equal((await f.request('two-factor/verify-otp',{code})).status,401);
  assert.equal((await f.request('get-session')).data,null);
});
test('confirmação expirada, código incorreto e dispositivo confiável não liberam acesso',async()=>{
  const f=await fixture();await f.setPassword();await f.signin();
  assert.equal((await f.request('two-factor/verify-otp',{code:'00000000',trustDevice:true})).status,400);
  assert.equal((await f.request('two-factor/disable',{password})).status,404);
  const wrong = f.mails.at(-1).code === '00000000' ? '11111111' : '00000000';
  assert.equal((await f.request('two-factor/verify-otp',{code:wrong})).status,401);
  f.database.exec("update olhan_auth_verification set expiresAt = 1");
  assert.ok((await f.verify()).status>=400);assert.equal((await f.request('get-session')).data,null);
});
test('redefinição invalida sessões e token, não autentica e mantém confirmação obrigatória',async()=>{
  const f=await fixture();await f.setPassword();await f.signin(true);await f.verify();const oldCookie=f.cookie();
  await f.reset();const token=new URLSearchParams(new URL(f.mails.at(-1).link).hash.slice(1)).get('reset');
  const nextPassword='Outra-senha-de-teste-456!';
  assert.equal((await f.request('reset-password',{token,newPassword:nextPassword})).status,200);
  assert.equal((await f.request('get-session',undefined,{cookies:oldCookie})).data,null);
  assert.equal((await f.request('reset-password',{token,newPassword:password})).status,400);
  assert.equal((await f.signin()).status,401);
  assert.equal((await f.request('sign-in/email',{email:adminEmail,password:nextPassword})).data.twoFactorRedirect,true);
  assert.equal((await f.request('get-session')).data,null);
});
test('manter conectado persiste por 30 dias somente após confirmar e-mail e restaura sem novo envio',async()=>{
  const f=await fixture();await f.setPassword();await f.signin(true);
  assert.equal((await f.request('get-session')).data,null);
  const confirmed=await f.verify();assert.equal(confirmed.status,200);
  const sessionCookie=confirmed.headers.getSetCookie().find(c=>c.startsWith('olhan.session_token='));
  assert.match(sessionCookie,new RegExp('Max-Age='+REMEMBER_SESSION_SECONDS,'i'));assert.match(sessionCookie,/HttpOnly/i);assert.match(sessionCookie,/SameSite=Lax/i);
  const row=f.database.prepare('select * from olhan_auth_session').get();
  assert.ok(Math.abs(new Date(row.expiresAt).getTime()-Date.now()-REMEMBER_SESSION_SECONDS*1000)<5000);
  const mailCount=f.mails.length;
  assert.equal((await f.request('get-session',undefined,{cookies:f.cookie()})).data.user.email,adminEmail);
  assert.equal(f.mails.length,mailCount);
  const rawCookie=f.cookie();await f.request('sign-out',{});
  assert.equal((await f.request('get-session',undefined,{cookies:rawCookie})).data,null);
  await f.signin(true);assert.equal((await f.request('get-session')).data,null);
});
test('sem manter conectado, cookie não persiste e servidor limita sessão a oito horas',async()=>{
  const f=await fixture();await f.setPassword();const challenge=await f.signin(false);
  assert.match(challenge.headers.getSetCookie().find(c=>c.startsWith('olhan.dont_remember=')),/Max-Age=600/i);
  const confirmed=await f.verify();
  assert.equal(confirmed.status,200);
  const sessionCookie=confirmed.headers.getSetCookie().find(c=>c.startsWith('olhan.session_token='));
  assert.ok(sessionCookie);assert.doesNotMatch(sessionCookie,/Max-Age|Expires=/i);
  const row=f.database.prepare('select * from olhan_auth_session').get();
  assert.ok(Math.abs(new Date(row.expiresAt).getTime()-Date.now()-SHORT_SESSION_SECONDS*1000)<5000);
  assert.equal((await f.request('get-session',undefined,{cookies:''})).data,null);
});
test('preferência do login mais recente substitui tentativa anterior ainda não confirmada',async()=>{
  const f=await fixture();await f.setPassword();await f.signin(false);await f.signin(true);
  let confirmed=await f.verify();assert.equal(confirmed.status,200);
  assert.match(confirmed.headers.getSetCookie().find(c=>c.startsWith('olhan.session_token=')),/Max-Age=2592000/i);
  await f.request('sign-out',{});await f.signin(true);await f.signin(false);confirmed=await f.verify();
  assert.equal(confirmed.status,200);assert.doesNotMatch(confirmed.headers.getSetCookie().find(c=>c.startsWith('olhan.session_token=')),/Max-Age|Expires=/i);
});
test('sessão persistente vencida não é renovada silenciosamente',async()=>{
  const f=await fixture();await f.setPassword();await f.signin(true);await f.verify();
  f.database.exec('update olhan_auth_session set expiresAt=1');
  assert.equal((await f.request('get-session')).data,null);
});
test('troca de senha exige sessão e senha atual; não permite mudar e-mail ou desativar confirmação',async()=>{
  const f=await fixture();await f.setPassword();
  assert.equal((await f.request('change-password',{currentPassword:password,newPassword:'New-password-456!'})).status,401);
  await f.signin();await f.verify();
  assert.equal((await f.request('change-password',{currentPassword:'wrong',newPassword:'New-password-456!'})).status,400);
  assert.equal((await f.request('change-email',{newEmail:'thief@example.test'})).status,404);
  assert.equal((await f.request('change-password',{currentPassword:password,newPassword:'New-password-456!'})).status,200);
});
test('SMTP falho retorna erro sem alegar envio e sem sessão; origem externa é bloqueada',async()=>{
  const f=await fixture({failMail:true});
  const failed=await f.reset();assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.data).includes('private-smtp'));
  assert.equal((await f.request('sign-in/email',{email:adminEmail,password},{origin:'https://evil.test'})).status,403);
  assert.equal((await f.request('two-factor/enable',{password,method:'otp'})).status,404);
});
test('limite de envio é aplicado usando armazenamento no banco',async()=>{
  const f=await fixture({rateLimit:true});
  await f.reset();await f.reset();assert.equal((await f.reset()).status,429);
  assert.ok(f.database.prepare('select count(*) as n from olhan_auth_rate_limit').get().n>0);
});
test('proteção do servidor falha fechada e não aceita cookie compartilhado de IA',async()=>{
  const res=()=>({headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}});
  let ran=false;const handler=()=>{ran=true};let r=res();
  await protect(handler,async()=>null)({headers:{cookie:'__Host-olhan-ai=fake'}},r);assert.equal(r.code,401);assert.equal(ran,false);
  r=res();await protect(handler,async()=>{throw Error('secret')})({headers:{}},r);assert.equal(r.code,503);assert.ok(!r.body.includes('secret'));
  assert.throws(()=>smtpConfig({SMTP_HOST:'x',SMTP_USER:'x',SMTP_PASS:'x',SMTP_FROM:'x',SMTP_PORT:'25'}));
});
