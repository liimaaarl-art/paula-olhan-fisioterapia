import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM,VirtualConsole } from 'jsdom';
import { applyCollaboratorAction,projectCollaboratorWorkspace } from '../lib/collaborator-access.mjs';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const email='tanaka.ana91@gmail.com';
const visit=(id,patient,date,time,service='Fisioterapia domiciliar')=>({id,patient,pro:'ana',date,time,service,status:'Agendado',duration:60});
const fixture=()=>({revision:4,data:{
  team:[{id:'ana',name:'Ana',email,role:'Fisioterapeuta colaboradora'},{id:'other',name:'Outra'}],
  patients:[{id:'p1',name:'Pessoa atribuída',pro:'ana',treatmentStartDate:'2026-11-10'},{id:'p2',name:'Paciente de outra conta',pro:'other'},{id:'p3',name:'Segundo paciente',pro:'ana'}],
  appointments:[visit('a1','p1','2026-11-24','09:00'),visit('a2','p3','2026-11-24','09:00'),visit('a3','p1','2026-11-25','11:00','Avaliação inicial'),visit('a4','p1','2026-12-01','09:00'),visit('a5','p2','2026-11-24','10:00')],
  records:[],files:[],contracts:[],invoices:[],fileFolders:['Geral','Documentos']
}});
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}assert.fail('Interface não chegou ao estado esperado.')}
async function app(options={}){
 let db=fixture(),count=0;const requests=[],errors=[];
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
 const scripts=[];
 const html=read('collaborator.html').replace(/<script defer src="\/([^"]+)"><\/script>/g,(_,f)=>{scripts.push('<script>'+read(f)+'</script>');return ''}).replace('</body>',scripts.join('')+'</body>');
 const dom=new JSDOM(html,{url:'https://olhan.test/',runScripts:'dangerously',virtualConsole:console,beforeParse(w){
  const D=w.Date;w.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-11-25T15:00:00Z']))}static now(){return D.parse('2026-11-25T15:00:00Z')}};
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async(url,opts)=>{
   if(opts.method==='GET')return {ok:true,json:async()=>projectCollaboratorWorkspace(db,email)};
   const body=JSON.parse(opts.body);requests.push({url,body});
   if(url==='/api/files')return {ok:true,json:async()=>({id:'test-file-'+(++count),data:'/api/files?id=test-file-'+count,name:body.name,type:body.type})};
   if(url==='/api/ai')return {ok:true,json:async()=>({fields:{general:'Sugestão',pain:'0'},text:'Transcrição'})};
   if(options.reject?.(body))return {ok:false,json:async()=>({error:'Falha simulada no servidor'})};
   try{db={revision:db.revision+1,data:applyCollaboratorAction(db,email,body.action,body.payload,()=> 'new-'+(++count))};return {ok:true,json:async()=>({revision:db.revision})}}
   catch(e){return {ok:false,json:async()=>({error:e.message})};}
  };
 }});
 const w=dom.window,$=s=>w.document.querySelector(s);await until(()=>$('#person').textContent==='Ana');assert.deepEqual(errors,[]);
 return {w,$,requests,db:()=>db};
}
test('visão semanal exibe horários simultâneos e abre evolução vinculada pelo atendimento',async()=>{
 const {w,$,db,requests}=await app();try{
  $('[data-page="agenda"]').click();assert.equal(w.document.querySelectorAll('.week-grid thead th').length,8);
  assert.equal(w.document.querySelectorAll('.week-visit').length,3);assert.match($('.week-grid').textContent,/Segundo paciente/);assert.doesNotMatch($('.week-grid').textContent,/Paciente de outra conta/);
  $('[data-week="7"]').click();assert.equal(w.document.querySelectorAll('.week-visit').length,1);assert.equal($('[data-evolve]'),null);
  $('[data-week="today"]').click();$('[data-evolve="a1"]').click();const form=$('#form-modal form');
  assert.match(form.textContent,/Pessoa atribuída/);form.elements.general.value='Evolução fictícia';form.elements.pain.value='0';form.requestSubmit();
  await until(()=>!$('#form-modal'));
  assert.equal(requests[0].body.payload.appointment,'a1');assert.equal(db().data.records[0].general,'Evolução fictícia');assert.equal(db().data.appointments[0].status,'Realizado');
  assert.equal($('[data-evolve="a1"]'),null);
 }finally{w.close()}
});
test('avaliação inicial abre a ficha completa e não fecha o formulário se o servidor negar',async()=>{
 const {w,$}=await app({reject:()=>true});try{
  $('[data-page="agenda"]').click();$('[data-evolve="a3"]').click();
  const form=$('#form-modal form');assert.ok(form.elements.medicalDiagnosis);assert.ok(form.elements.strength);assert.ok(form.elements.painPoints);
  form.elements.complaint.value='Motivo relatado';form.elements.objective.value='Meta';form.requestSubmit();
  await until(()=>$('.form-message')?.textContent.includes('Falha simulada'));
  assert.equal(form.elements.complaint.value,'Motivo relatado');
 }finally{w.close()}
});
test('aba Anexos envia PDF privado à pasta escolhida no prontuário, sem cadastro de paciente',async()=>{
 const {w,$,requests,db}=await app();try{
  $('[data-page="pacientes"]').click();$('[data-patient="p1"]').click();
  assert.match($('.patient-summary').textContent,/10\/11\/2026/);assert.doesNotMatch($('#main').textContent,/Novo paciente/);
  $('[data-type="files"]').click();const input=$('#upload');$('#upload-folder').value='Documentos';
  const file=new w.File(['%PDF-1.7'],'Relatório.pdf',{type:'application/pdf'});
  Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new w.Event('change'));
  await until(()=>$('#main a[download]')?.textContent==='Relatório.pdf');
  assert.equal(requests.find(x=>x.url==='/api/files').body.patient,'p1');assert.equal(db().data.files[0].folder,'Documentos');
 }finally{w.close()}
});
