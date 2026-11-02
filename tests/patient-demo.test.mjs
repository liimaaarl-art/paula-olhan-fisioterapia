import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../portal/patient-demo.js',import.meta.url),'utf8');
function demo(){const context={window:{},URLSearchParams,fetch(){throw Error('Preview must never call the network');}};vm.runInNewContext(source,context);return context.window.OlhanPatientDemo;}
test('demo login opens sample content only and logout removes access',async()=>{
 const d=demo();await assert.rejects(d.request(),/Entre/);await assert.rejects(d.request({action:'login',cpf:'admin',password:'errada'}),/incorretos/);
 await d.request({action:'login',cpf:'admin',password:'olhan'});
 const view=await d.request(null,'?patientId=another-patient');assert.equal(view.name,'Paula Olhan');assert.equal(view.media.length,2);assert.ok(!('cpf' in view));
 view.name='Changed';assert.equal((await d.request()).name,'Paula Olhan');
 assert.equal((await d.request(null,'?action=file&id=demo-video')).url,'/patient-demo-video.mp4');
 await assert.rejects(d.request(null,'?action=file&id=private-file'),/não encontrado/);
 await assert.rejects(d.request({action:'invite'}),/apenas visualizar/);
 await d.request({action:'logout'});await assert.rejects(d.request(),/Entre/);
});
test('preview cannot fall back to the real API, even if its sample module fails to load',async()=>{
 const ui=readFileSync(new URL('../portal/patient-portal.js',import.meta.url),'utf8');
 const element=tag=>({tag,children:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},addEventListener(){}});
 for(const mode of ['demo','demo-module-missing','real']){
  let networkCalls=0;const content=element('section'),status=element('p');
  const context={window:mode==='demo'?{OlhanPatientDemo:demo()}:{},document:{body:{dataset:mode==='real'?{}:{patientDemo:'true'}},getElementById:id=>id==='content'?content:status,createElement:element},location:{hash:'',pathname:'/paciente.html'},history:{replaceState(){}},URLSearchParams,fetch:async()=>{networkCalls++;return {ok:false,json:async()=>({error:'Não autenticado'})}}};
  vm.runInNewContext(ui,context);await new Promise(setImmediate);
  assert.equal(networkCalls,mode==='real'?1:0);
  const inputs=[];const visit=n=>{if(n.tag==='input')inputs.push(n);for(const child of n.children||[])if(typeof child==='object')visit(child)};visit(content);
  assert.equal(inputs.length,2);assert.equal(inputs[0].value,mode==='real'?undefined:'admin');
 }
});
