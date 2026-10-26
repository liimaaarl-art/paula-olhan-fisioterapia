// One-time, explicit deployment setup. No password or hash is logged or committed.
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
if (process.env.VERCEL_ENV==='production' && process.env.OLHAN_SUPPORT_INITIAL_PASSWORD) {
 const email=String(process.env.OLHAN_SUPPORT_EMAIL||'').trim().toLowerCase();
 if(!email||email===String(process.env.OLHAN_ADMIN_EMAIL||'').trim().toLowerCase())throw Error('SUPPORT_IDENTITY_INVALID');
 const password=process.env.OLHAN_SUPPORT_INITIAL_PASSWORD;
 const hash=await hashPassword(password);
 if(!await verifyPassword({hash,password}))throw Error('SUPPORT_PASSWORD_HASH_INVALID');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});const c=await pool.connect();
 try {
  await c.query('BEGIN');
  const existing=await c.query('SELECT id,role FROM olhan_auth_user WHERE email=$1 FOR UPDATE',[email]);
  let uid=existing.rows[0]?.id;
  if(uid && existing.rows[0].role!=='support')throw Error('SUPPORT_ROLE_CONFLICT');
  if(!uid){uid=randomUUID();await c.query('INSERT INTO olhan_auth_user(id,name,email,"emailVerified","twoFactorEnabled",role,"createdAt","updatedAt") VALUES($1,$2,$3,true,true,\'support\',now(),now())',[uid,'Suporte Florindo Sistemas',email]);}
  const accounts=await c.query('SELECT id,password FROM olhan_auth_account WHERE "userId"=$1 AND "providerId"=\'credential\'',[uid]);
  if(!accounts.rows.length)await c.query('INSERT INTO olhan_auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),uid,hash]);
  else if(!await verifyPassword({hash:accounts.rows[0].password,password}))throw Error('SUPPORT_PASSWORD_ALREADY_SET');
  await c.query('COMMIT');console.info('SUPPORT_ACCOUNT_READY');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
}
