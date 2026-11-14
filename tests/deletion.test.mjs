import test from 'node:test';
import assert from 'node:assert/strict';
import '../deletion-core.js';
import { deletionHandler } from '../lib/deletion-route.js';
import { workspaceHandler } from '../api/workspace.js';
import { validateState } from '../lib/workspace.js';
import { livePatient } from '../lib/patient-store.js';
import { identityKey } from '../lib/patient-security.js';
import { projectCollaboratorWorkspace } from '../lib/collaborator-access.mjs';
const core=globalThis.OlhanDeletionCore;
const ap=(id,date='2026-11-16',time='08:00',more={})=>({id,patient:'p1',pro:'t1',date,time,duration:60,price:150,status:'Agendado',seriesId:'s1',...more});
const fixture=()=>({patients:[{id:'p1',name:'Pessoa fictícia',cpf:'52998224725',birth:'1950-01-01',pro:'t1',status:'Ativo'},{id:'p2',name:'Outra pessoa',pro:'t1'}],team:[{id:'t1',name:'Colaboradora',email:'tanaka.ana91@gmail.com',role:'Fisioterapeuta colaboradora'}],appointments:[ap('past','2026-11-09'),ap('a'),ap('wed','2026-11-18','09:00'),ap('b','2026-11-23'),ap('other','2026-11-24','09:00',{seriesId:'s2'}),ap('avulso','2026-11-25','09:00',{seriesId:null}),ap('other-person','2026-11-26','10:00',{patient:'p2'})],records:[],invoices:[],files:[],cashEntries:[],contracts:[],care:{preferences:{travelMinutes:15}}});
function apply(data,plan){let n=0;return core.apply(data,plan,{makeId:()=>`trash-${++n}`,now:'2026-11-14T18:00:00Z',actor:'admin'});}
test('revisar e cancelar não muda nenhum cadastro; excluir uma sessão preserva a série',()=>{
 const data=fixture(),before=JSON.stringify(data),plan=core.prepare(data,'appointment','a');assert.equal(JSON.stringify(data),before);assert.equal(plan.count,1);
 const next=apply(data,plan);assert.ok(!next.appointments.some(a=>a.id==='a'));assert.ok(next.appointments.some(a=>a.id==='b'));assert.equal(next.recycleBin[0].items[0].id,'a');assert.equal(JSON.stringify(data),before);
});
test('esta e próximas inclui todos os dias da mesma série, sem atingir passado, avulsos ou outro paciente',()=>{
 const plan=core.prepare(fixture(),'appointment','a','future');assert.deepEqual(plan.appointments.map(a=>a.id),['a','wed','b']);
});
test('próximas respeita o horário da origem no mesmo dia',()=>{
 const data=fixture();data.appointments.push(ap('early','2026-11-16','07:00'),ap('late','2026-11-16','17:00'));const plan=core.prepare(data,'appointment','a','future');assert.ok(!plan.appointments.some(a=>a.id==='early'));assert.ok(plan.appointments.some(a=>a.id==='late'));
});
test('evolução, rascunho, cobrança, fechamento, repasse e reposição protegem sessões',()=>{
 for(const protect of [d=>d.records.push({appointment:'a',draft:false}),d=>d.records.push({appointment:'a',draft:true}),d=>d.appointments.find(a=>a.id==='a').status='Realizado',d=>d.appointments.find(a=>a.id==='a').status='Cancelado com cobrança',d=>d.invoices.push({items:[{id:'a'}]}),d=>d.cashEntries.push({appointmentIds:['a']}),d=>d.appointments.find(a=>a.id==='a').replacementOf='previous',d=>d.appointments.find(a=>a.id==='a').replacementId='next']){
  const data=fixture();protect(data);assert.throws(()=>core.prepare(data,'appointment','a'),/não pode ser excluído/);
 }
 const data=fixture();data.records.push({appointment:'b'});const plan=core.prepare(data,'appointment','a','future');assert.equal(plan.retained,1);assert.deepEqual(plan.appointments.map(a=>a.id),['a','wed']);
});
test('exclusão de paciente tira cadastro e sessões livres, preserva histórico, contratos e financeiro',()=>{
 const data=fixture();data.appointments[0].status='Realizado';data.records.push({id:'r1',patient:'p1',appointment:'past',general:'Registro',draft:false});data.invoices.push({id:'i1',patient:'p1',items:[data.appointments[0]],total:150,paid:true});data.files.push({id:'f1',patient:'p1',cloudId:'f1',data:'/api/files?id=f1'});data.contracts.push({id:'c1',patient:'p1',status:'Assinado'});
 const next=apply(data,core.prepare(data,'patient','p1'));assert.ok(!next.patients.some(p=>p.id==='p1'));assert.equal(next.appointments.filter(a=>a.patient==='p1').length,1);for(const key of ['records','invoices','files','contracts','cashEntries'])assert.deepEqual(next[key],data[key]);assert.equal(validateState(next),next);
 assert.equal(next.recycleBin[0].patient.name,'Pessoa fictícia');assert.ok(!projectCollaboratorWorkspace({data:next,revision:2},'tanaka.ana91@gmail.com').data.patients.some(p=>p.id==='p1'));
 const secret='test-secret-for-patient-identity-checks-123';assert.equal(livePatient(next,{patient_id:'p1',active:true,cpf_key:identityKey(data.patients[0].cpf,secret)},secret),null);
});
test('restaurar paciente não reinsere agenda automaticamente; depois restaura grupo sem duplicar',()=>{
 let data=fixture();data.appointments=data.appointments.filter(a=>a.patient==='p1');const original=data.appointments.length;data=apply(data,core.prepare(data,'patient','p1'));const patientItem=data.recycleBin.find(i=>i.kind==='patient'),agendaItem=data.recycleBin.find(i=>i.kind==='appointments');
 assert.throws(()=>core.prepare(data,'restore',agendaItem.id),/primeiro/);data=apply(data,core.prepare(data,'restore',patientItem.id));assert.ok(data.patients.some(p=>p.id==='p1'));assert.equal(data.appointments.length,0);data=apply(data,core.prepare(data,'restore',agendaItem.id));assert.equal(data.appointments.length,original);assert.equal(data.recycleBin.length,0);assert.throws(()=>core.prepare(data,'restore',agendaItem.id),/não encontrado/);
});
test('restaurar agenda com conflito ou sem profissional não altera a base',()=>{
 const original=fixture();let data=apply(original,core.prepare(original,'appointment','a'));const ref=data.recycleBin[0].id;data.appointments.push(ap('conflict','2026-11-16','08:30'));const before=JSON.stringify(data);assert.throws(()=>core.prepare(data,'restore',ref),/conflito/);assert.equal(JSON.stringify(data),before);data.appointments.pop();data.team=[];assert.throws(()=>core.prepare(data,'restore',ref),/profissional/);
});
test('restauração bloqueia CPF ou identificador duplicado e plano desatualizado',()=>{
 const original=fixture();let data=apply(original,core.prepare(original,'patient','p1'));data.patients[0].cpf='529.982.247-25';assert.throws(()=>core.prepare(data,'restore',data.recycleBin[0].id),/CPF/);
 const before=fixture(),plan=core.prepare(before,'appointment','a');before.appointments.find(a=>a.id==='a').notes='Mudou';assert.throws(()=>apply(before,plan),/mudaram/);
});
test('ordenação de chaves do JSONB não invalida uma revisão idêntica',()=>{
 const data=fixture(),plan=core.prepare(data,'patient','p1');
 data.patients=data.patients.map(p=>Object.fromEntries(Object.entries(p).reverse()));data.appointments=data.appointments.map(a=>Object.fromEntries(Object.entries(a).reverse()));
 assert.ok(core.samePlan(core.prepare(data,'patient','p1'),plan));assert.equal(apply(data,plan).patients.length,1);
});
test('base não aceita item ativo duplicado na lixeira e mantém validade após restauração',()=>{
 const data=fixture(),next=apply(data,core.prepare(data,'appointment','a'));assert.equal(validateState(next),next);next.appointments.push(data.appointments.find(a=>a.id==='a'));assert.throws(()=>validateState(next),/duplicado/);
 const patient=apply(data,core.prepare(data,'patient','p1'));patient.patients.push(data.patients[0]);assert.throws(()=>validateState(patient),/duplicado/);
});
const headers={origin:'https://olhan.test',host:'olhan.test','content-type':'application/json'};
const user={id:'admin-user',role:'admin'};
const response=()=>({statusCode:0,headers:{},status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k]=v;return this},end(s){this.body=JSON.parse(s)}});
function server(data=fixture(),{rejectWrite=false,syncError=false}={}){
 let state={revision:7,data},writes=0,syncs=0;
 const sql=async(strings,...values)=>{const q=strings.join('?');if(q.startsWith('SELECT revision,data'))return [structuredClone(state)];if(q.includes('WITH changed AS')){writes++;if(rejectWrite)return [];state={revision:state.revision+1,data:JSON.parse(values[0])};assert.match(q,/WHERE id='olhan' AND revision=/);assert.match(q,/olhan_workspace_history/);return [{revision:state.revision}];}throw Error('Unexpected SQL');};
 const handler=deletionHandler({sqlFactory:()=>sql,makeId:(()=>{let i=0;return()=>`bin-${++i}`})(),sync:async()=>{syncs++;if(syncError)throw Error('sync');}});
 return {handler,sql,state:()=>state,writes:()=>writes,syncs:()=>syncs};
}
const request=(data,more={})=>({method:'POST',olhanUser:user,headers,body:{revision:7,kind:'appointment',ref:'a',scope:'once',plan:core.prepare(data,'appointment','a')},...more});
test('API exige sessão administrativa, mesma origem, JSON e revisão, sem consultar dados indevidamente',async()=>{
 const h=deletionHandler({sqlFactory:()=>{throw Error('Do not query');}});
 for(const [patch,status] of [[{olhanUser:null},401],[{olhanUser:{role:'collaborator'}},403],[{olhanUser:{role:'patient'}},403],[{method:'GET'},405],[{headers:{...headers,origin:'https://foreign.test'}},403],[{headers:{...headers,'content-type':'text/plain'}},415],[{body:{}},400]]){const res=response();await h(request(fixture(),patch),res);assert.equal(res.statusCode,status);}
});
test('API verifica revisão e plano antes de salvar, e uma corrida CAS não produz sucesso',async()=>{
 for(const mode of ['stale','tampered','cas']){const data=fixture(),s=server(data,{rejectWrite:mode==='cas'}),req=request(data),res=response();if(mode==='stale')req.body.revision=6;if(mode==='tampered')req.body.plan.count=999;await s.handler(req,res);assert.equal(res.statusCode,409);assert.equal(s.writes(),mode==='cas'?1:0);assert.equal(s.state().data.appointments.length,data.appointments.length);}
});
test('API salva exclusão e restauração com revisão, histórico e desativação de acesso',async()=>{
 const data=fixture(),s=server(data),res=response(),plan=core.prepare(data,'patient','p1');await s.handler({method:'POST',olhanUser:user,headers,body:{revision:7,kind:'patient',ref:'p1',plan}},res);assert.equal(res.statusCode,200);assert.equal(res.body.revision,8);assert.equal(res.body.data.patients.length,1);assert.equal(s.syncs(),1);
 const bin=res.body.data.recycleBin.find(i=>i.kind==='patient'),restored=response();await s.handler({method:'POST',olhanUser:user,headers,body:{revision:8,kind:'restore',ref:bin.id,plan:core.prepare(res.body.data,'restore',bin.id)}},restored);assert.equal(restored.statusCode,200);assert.equal(restored.body.revision,9);assert.equal(restored.body.data.patients.length,2);assert.equal(s.syncs(),2);
});
test('rota existente de workspace recebe a exclusão sem adicionar nova função Vercel',async()=>{
 const data=fixture(),s=server(data),req=request(data),res=response();req.body.action='manage-exclusions';await workspaceHandler(()=>s.sql)(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.revision,8);assert.ok(!res.body.data.appointments.some(a=>a.id==='a'));assert.equal(s.writes(),1);
});
test('falha na sincronização não reabre o portal de paciente excluído',async()=>{
 const data=fixture(),s=server(data,{syncError:true}),res=response();await s.handler({method:'POST',olhanUser:user,headers,body:{revision:7,kind:'patient',ref:'p1',plan:core.prepare(data,'patient','p1')}},res);assert.equal(res.statusCode,200);assert.equal(res.body.portalPending,true);assert.ok(!res.body.data.patients.some(p=>p.id==='p1'));
});
