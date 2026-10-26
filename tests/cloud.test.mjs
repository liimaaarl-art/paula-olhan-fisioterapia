import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceHandler } from '../api/workspace.js';
import { fileHandler } from '../api/files.js';
import { validateState } from '../lib/workspace.js';
const data=()=>({patients:[{id:'p1'}],team:[],appointments:[],records:[],invoices:[],files:[]});
const headers={origin:'https://olhan.test',host:'olhan.test','content-type':'application/json'};
const user={id:'owner',role:'admin'};
function response(){return {statusCode:0,headers:{},status(s){this.statusCode=s;return this},setHeader(k,v){this.headers[k]=v;return this},end(s){this.body=typeof s==='string'?JSON.parse(s):s}};}
test('cloud rejeita base incompleta e anexos ainda locais',()=>{
 assert.throws(()=>validateState({}));const d=data();d.files.push({id:'f1',patient:'p1',data:'data:image/png;base64,YWJj'});assert.throws(()=>validateState(d));d.files[0].cloudId='cloud-uuid';d.files[0].data='/api/files?id=cloud-uuid';assert.equal(validateState(d),d);
});
test('cloud exige sessão, origem e inicialização pela administradora',async()=>{
 const handler=workspaceHandler(()=>{throw Error('Must not query')});
 for(const [request,status] of [[{method:'GET'},401],[{method:'PUT',olhanUser:user,headers:{...headers,origin:'https://foreign.test'}},403],[{method:'PUT',olhanUser:{id:'support',role:'support'},headers,body:{revision:0,data:data()}},403]]){
  const r=response();await handler(request,r);assert.equal(r.statusCode,status);
 }
});
test('conflito de revisão nunca retorna sucesso',async()=>{
 const handler=workspaceHandler(()=>async()=>[]),r=response();await handler({method:'PUT',olhanUser:user,headers,body:{revision:5,data:data()}},r);assert.equal(r.statusCode,409);assert.equal(r.body.code,'REVISION_CONFLICT');
});
test('arquivos privados exigem sessão e vínculo real ao prontuário',async()=>{
 let accessed=false;const handler=fileHandler({config:()=>({}),sqlFactory:()=>async()=>[],clientFactory:()=>{accessed=true;throw Error();}});
 const unauth=response();await handler({method:'GET',query:{}},unauth);assert.equal(unauth.statusCode,401);
 const missing=response();await handler({method:'GET',olhanUser:user,query:{id:'11111111-1111-4111-8111-111111111111'}},missing);assert.equal(missing.statusCode,404);assert.equal(accessed,false);
});
test('envio de arquivo recusa origem externa, tipo e tamanho antes de tocar no R2',async()=>{
 const handler=fileHandler({config:()=>({}),sqlFactory:()=>async()=>[],clientFactory:()=>{throw Error('Must not access R2');}});
 for(const body of [{name:'teste.html',patient:'p1',type:'text/html',base64:'YWJj'},{name:'teste.pdf',patient:'p1',type:'application/pdf',base64:'!bad!'}]){const r=response();await handler({method:'POST',olhanUser:user,headers,body},r);assert.equal(r.statusCode,400);}
 const foreign=response();await handler({method:'POST',olhanUser:user,headers:{...headers,origin:'https://foreign.test'},body:{}},foreign);assert.equal(foreign.statusCode,403);
});
