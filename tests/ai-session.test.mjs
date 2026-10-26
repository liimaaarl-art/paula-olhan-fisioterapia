import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler as ai } from '../api/ai.js';
import { handler as access } from '../api/ai-access.js';
import { issueSession, COOKIE } from '../lib/ai-session.js';
function response(){return {statusCode:0,headers:{},status(s){this.statusCode=s;return this},setHeader(k,v){this.headers[k]=v},end(s){this.body=JSON.parse(s)}};}
const headers={origin:'https://olhan.test',host:'olhan.test','content-type':'application/json'};
test('login individual libera IA sem código e sem cookie adicional',async()=>{
  process.env.GROQ_API_KEY='fake-provider-secret';delete process.env.OLHAN_AI_ACCESS_CODE;
  try {
    const status=response();await ai({method:'GET',olhanUser:{id:'owner'},headers},status);
    assert.equal(status.body.connected,true);assert.equal(status.body.configured,true);
    assert.ok(!JSON.stringify(status.body).includes('fake-provider-secret'));
    const invalid=response();await ai({method:'POST',olhanUser:{id:'support'},headers,body:{mode:'invalid'}},invalid);assert.equal(invalid.statusCode,400);
    const foreign=response();await ai({method:'POST',olhanUser:{id:'owner'},headers:{...headers,origin:'https://foreign.test'},body:{}},foreign);assert.equal(foreign.statusCode,403);
    const legacy=response();await access({method:'POST',olhanUser:{id:'owner'},headers,body:{}},legacy);assert.equal(legacy.statusCode,200);assert.match(legacy.headers['Set-Cookie'],/Max-Age=0/);
  }finally{delete process.env.GROQ_API_KEY;}
});
test('cookie e bearer legados não substituem sessão individual',async()=>{
 const req={method:'GET',headers:{...headers,authorization:'Bearer old-code',cookie:COOKIE+'='+issueSession('old-code')}};
 const status=response();await ai(req,status);assert.equal(status.statusCode,401);
 const legacy=response();await access({...req,method:'POST'},legacy);assert.equal(legacy.statusCode,401);
});
