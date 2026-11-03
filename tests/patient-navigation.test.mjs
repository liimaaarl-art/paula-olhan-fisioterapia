import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../portal/paciente.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../portal/patient-portal.js',import.meta.url),'utf8');
const fixture=()=>({name:'Paula Olhan (Teste)',media:[
 {id:'v1',type:'video/mp4',name:'Primeiro vídeo.mp4',date:'2099-01-04'},
 {id:'v2',type:'video/mp4',name:'Segundo vídeo.mp4',date:'2099-01-05'},
 {id:'p1',type:'image/jpeg',name:'Foto de cuidado.jpg',date:'2099-01-04'},
 {id:'d1',type:'application/pdf',name:'Relatório de avaliação.pdf',date:'2099-01-04'},
 {id:'d2',type:'application/pdf',name:'Recibo.pdf',date:'2099-01-05'}
],records:[
 {date:'2099-01-04',type:'Evolução',fields:[{label:'Conduta',text:'NOTA CLÍNICA DO DIA 04'}]},
 {date:'2099-01-05',type:'Evolução',fields:[{label:'Resposta',text:'NOTA CLÍNICA DO DIA 05'}]}
],appointments:[{date:'2099-01-10',time:'09:00',status:'Agendado'},{date:'2000-01-01',time:'08:00',status:'Realizado'}]});
const flush=async()=>{for(let n=0;n<3;n++)await new Promise(setImmediate);};
async function setup(t,{value=fixture(),mode='demo',fileRequest}={}){
 const dom=new JSDOM(html,{url:'https://portal.test/paciente.html',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>dom.window.close());const calls=[],network=[];
 w.HTMLMediaElement.prototype.pause=function(){this.dataset.paused='true';};
 w.HTMLMediaElement.prototype.load=function(){};
 w.document.body.dataset.patientDemo=mode==='real'?'false':'true';
 if(mode==='demo')w.OlhanPatientDemo={async request(body,query=''){
  calls.push({body,query});if(body)return {ok:true};
  if(query){if(fileRequest)return fileRequest(query);return {url:'https://portal.test/private/'+new URLSearchParams(query.slice(1)).get('id')};}
  return value;
 }};
 w.fetch=async(...args)=>{network.push(args);return {ok:false,status:401,json:async()=>({error:'Entre novamente.'})};};
 w.eval(script);await flush();return {dom,w,doc:w.document,calls,network};
}
const click=(doc,selector)=>{const target=doc.querySelector(selector);assert.ok(target,'Missing control: '+selector);target.click();};
const fileCalls=calls=>calls.filter(c=>c.query.includes('action=file'));
test('home opens scalable libraries without loading files or exposing clinical text',async t=>{
 const {doc,w,calls}=await setup(t);
 assert.equal(doc.querySelectorAll('.category-card').length,4);
 assert.ok(!doc.body.textContent.includes('NOTA CLÍNICA'));
 assert.equal(fileCalls(calls).length,0);
 click(doc,'.nav-button[data-page="videos"]');
 assert.equal(doc.querySelectorAll('[data-file-id]').length,2);
 const search=doc.querySelector('input[type="search"]');search.value='segundo';search.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(doc.querySelectorAll('[data-file-id]').length,1);
 assert.equal(doc.querySelector('[data-file-id]').dataset.fileId,'v2');
 assert.equal(fileCalls(calls).length,0);
 click(doc,'[data-file-id="v2"]');await flush();
 assert.equal(fileCalls(calls).length,1);assert.ok(doc.querySelector('video').controls);
 assert.ok(!doc.querySelector('video').autoplay);
 assert.equal(doc.querySelectorAll('[data-file-id]').length,0);
 click(doc,'.back-button');
 assert.equal(doc.querySelectorAll('[data-file-id]').length,1);
});
test('evolutions require date selection followed by record selection',async t=>{
 const {doc}=await setup(t);
 click(doc,'.nav-button[data-page="visits"]');
 assert.equal(doc.querySelectorAll('[data-day]').length,2);
 assert.ok(!doc.body.textContent.includes('NOTA CLÍNICA'));
 click(doc,'[data-day="2099-01-04"]');
 assert.ok(!doc.body.textContent.includes('NOTA CLÍNICA'));
 assert.equal(doc.querySelectorAll('[data-record-index]').length,1);
 assert.equal(doc.querySelectorAll('[data-file-id]').length,1);
 click(doc,'[data-record-index="0"]');
 assert.ok(doc.body.textContent.includes('NOTA CLÍNICA DO DIA 04'));
 assert.ok(!doc.body.textContent.includes('NOTA CLÍNICA DO DIA 05'));
 click(doc,'.back-button');assert.ok(!doc.body.textContent.includes('NOTA CLÍNICA'));
});
test('documents require date and file selection before requesting a private URL',async t=>{
 const {doc,w,calls}=await setup(t);
 click(doc,'.nav-button[data-page="documents"]');
 assert.equal(doc.querySelectorAll('[data-day]').length,2);
 assert.equal(doc.querySelectorAll('[data-file-id]').length,0);
 assert.ok(!doc.body.textContent.includes('Relatório de avaliação.pdf'));
 const filter=doc.querySelector('input[type="date"]');filter.value='2099-01-04';filter.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(doc.querySelectorAll('[data-day]').length,1);
 click(doc,'[data-day="2099-01-04"]');
 assert.equal(doc.querySelectorAll('[data-file-id]').length,1);assert.equal(fileCalls(calls).length,0);
 click(doc,'[data-file-id="d1"]');await flush();
 const link=doc.querySelector('.document-stage a');assert.equal(link.href,'https://portal.test/private/d1');assert.equal(link.rel,'noopener noreferrer');
 assert.equal(fileCalls(calls).length,1);
});
test('a slow file response cannot replace another library after navigation',async t=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});
 const {doc}=await setup(t,{fileRequest:()=>pending});
 click(doc,'.nav-button[data-page="videos"]');click(doc,'[data-file-id="v1"]');
 click(doc,'.nav-button[data-page="photos"]');
 resolve({url:'https://portal.test/private/v1'});await flush();
 assert.equal(doc.querySelectorAll('video').length,0);
 assert.equal(doc.querySelector('[data-file-id]').dataset.fileId,'p1');
});
test('file names and clinical text render as text, and logout clears the private view',async t=>{
 const value=fixture();value.media[0].name='<img src=x onerror=alert(1)>';value.records[0].fields[0].text='<script>alert(1)</script>';
 const {doc}=await setup(t,{value});
 click(doc,'.nav-button[data-page="videos"]');assert.ok(!doc.querySelector('img[src=x]'));
 click(doc,'.nav-button[data-page="visits"]');click(doc,'[data-day="2099-01-04"]');click(doc,'[data-record-index="0"]');
 assert.ok(doc.querySelector('.clinical-record').textContent.includes('<script>'));assert.equal(doc.querySelectorAll('.clinical-record script').length,0);
 const logout=[...doc.querySelectorAll('.account-actions button')].find(b=>b.textContent==='Sair');logout.click();await flush();
 assert.equal(doc.querySelectorAll('.portal-shell').length,0);assert.ok(!doc.body.textContent.includes('<script>alert'));
 assert.ok(doc.querySelector('input[autocomplete="current-password"]'));
});
test('empty libraries retain navigation and missing demo code never calls the real API',async t=>{
 const value={name:'Paula',media:[],records:[],appointments:[]};
 const {doc}=await setup(t,{value});assert.equal(doc.querySelectorAll('.category-card').length,4);
 click(doc,'.nav-button[data-page="videos"]');assert.ok(doc.querySelector('.empty-state'));assert.ok(doc.querySelector('.back-button'));
 const missing=await setup(t,{mode:'missing'});assert.equal(missing.network.length,0);assert.ok(missing.doc.querySelector('.auth-form'));
 const real=await setup(t,{mode:'real'});assert.equal(real.network.length,1);assert.equal(real.doc.querySelector('input[name="cpf"]').value,'');
});
