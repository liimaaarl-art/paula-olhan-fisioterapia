import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { workspaceHandler } from '../api/workspace.js';
test('Postgres isolado: escrita versionada preserva dados e bloqueia sessão desatualizada',{skip:!process.env.AUTH_TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.AUTH_TEST_DATABASE_URL,max:2});
 const id=randomUUID();const c=await pool.connect();
 await c.query('BEGIN');
 try{
  const existing=await c.query("SELECT 1 FROM olhan_workspace WHERE id='olhan'");assert.equal(existing.rows.length,0,'Use somente branch isolada sem base clínica.');
  await c.query('INSERT INTO olhan_auth_user(id,name,email,"emailVerified","twoFactorEnabled",role,"createdAt","updatedAt") VALUES($1,\'Teste\',$2,true,true,\'admin\',now(),now())',[id,'test-'+id+'@example.test']);
  const sql=async(strings,...values)=>{let text=strings[0];for(let i=0;i<values.length;i++)text+='$'+(i+1)+strings[i+1];return (await c.query(text,values)).rows;};
  const handler=workspaceHandler(()=>sql);
  async function put(revision,name){const r={status(s){this.code=s;return this},setHeader(){return this},end(s){this.body=JSON.parse(s)}};await handler({method:'PUT',headers:{origin:'https://olhan.test',host:'olhan.test','content-type':'application/json'},olhanUser:{id,role:'admin'},body:{revision,data:{patients:[{id:'p1',name}],team:[],appointments:[],records:[],invoices:[],files:[]}}},r);return r;}
  await c.query('SAVEPOINT support_init');
  const first={status(s){this.code=s;return this},setHeader(){return this},end(s){this.body=JSON.parse(s)}};
  await handler({method:'POST',headers:{origin:'https://olhan.test',host:'olhan.test','content-type':'application/json'},olhanUser:{id,role:'support'},body:{action:'initialize'}},first);
  assert.equal(first.code,200);assert.equal(first.body.revision,1);assert.equal(first.body.data.patients.length,0);
  assert.equal((await c.query('SELECT count(*)::int AS n FROM olhan_workspace_history')).rows[0].n,1);
  await c.query('ROLLBACK TO SAVEPOINT support_init');
  assert.equal((await put(0,'Primeiro')).body.revision,1);
  assert.equal((await put(1,'Segundo')).body.revision,2);
  assert.equal((await put(1,'Aba antiga')).code,409);
  const rows=await c.query('SELECT revision,data FROM olhan_workspace');assert.equal(rows.rows[0].data.patients[0].name,'Segundo');
  assert.equal((await c.query('SELECT count(*)::int AS n FROM olhan_workspace_history')).rows[0].n,2);
  const reopened={status(s){this.code=s;return this},setHeader(){return this},end(s){this.body=JSON.parse(s)}};
  await handler({method:'POST',headers:{origin:'https://olhan.test',host:'olhan.test','content-type':'application/json'},olhanUser:{id,role:'support'},body:{action:'initialize'}},reopened);
  assert.equal(reopened.body.revision,2);assert.equal(reopened.body.data.patients[0].name,'Segundo');
  assert.equal((await c.query('SELECT count(*)::int AS n FROM olhan_workspace_history')).rows[0].n,2);
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
});
