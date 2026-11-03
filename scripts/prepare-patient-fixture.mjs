// One explicitly enabled support operation. Never replaces workspace data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { db } from '../lib/db.js';
import { workspaceHandler } from '../api/workspace.js';
import { mediaUploadHandler } from '../api/media-upload.js';
import { makePatientHandler } from '../lib/patient-service.js';

if(process.env.VERCEL_ENV!=='production'||process.env.OLHAN_PORTAL_FIXTURE!=='1')throw Error('Explicit production fixture flag required');
const password=process.env.OLHAN_PORTAL_FIXTURE_PASSWORD;
if(!password||password.length<12)throw Error('Fixture password required');
const sql=db(),patientId='portal-demo-paula-20261102',cpf='52998224725',birth='1990-01-01';
const origin='https://paulaolhanfisioterapeuta.vercel.app';
const [actor]=await sql`SELECT id,role FROM public.olhan_auth_user WHERE lower(email)=lower(${process.env.OLHAN_SUPPORT_EMAIL||''}) AND role='support' LIMIT 1`;
assert.ok(actor?.id,'Use the existing reserved support account for the fixture audit trail');
const headers={origin,host:new URL(origin).host,'content-type':'application/json'};
const date=offset=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(Date.now()+offset*86400000));
async function invoke(handler,body,method='POST'){
 let code,output;const response={setHeader(){return this},status(s){code=s;return this},end(value){output=JSON.parse(value);return this}};
 await handler({method,headers,body,query:{},olhanUser:actor},response);
 return {code,output};
}
async function mutate(update){
 for(let attempt=0;attempt<4;attempt++){
  const [row]=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;
  if(!row)throw Error('Initialize the clinical workspace first');
  const next=update(row.data);if(!next)return;
  const r=await invoke(workspaceHandler(()=>sql),{revision:row.revision,data:next},'PUT');
  if(r.code===409)continue;
  assert.equal(r.code,200,'Fixture workspace save failed');assert.equal(r.output.portalPending,false,'Fixture account enrollment failed');return;
 }
 throw Error('Workspace changed during fixture save. Retry without replacing data.');
}
await mutate(data=>{
 const existing=data.patients.find(p=>p.id===patientId);
 if(existing){assert.equal(existing.cpf,cpf);assert.equal(existing.birth,birth);return null;}
 assert.ok(!data.patients.some(p=>String(p.cpf||'').replace(/\D/g,'')===cpf),'The test CPF is already in use; no data changed');
 data.patients.push({id:patientId,name:'Paula Olhan (Teste)',cpf,birth,status:'Ativo',responsible:'',responsibleCpf:'',phone:'',address:'',pro:data.team[0]?.id||'',frequency:'Cadastro de teste',price:0,cycle:'Mensal',due:10,testFixture:true});return data;
});
const enrolled=await sql`SELECT active FROM public.olhan_patient_accounts WHERE patient_id=${patientId}`;
assert.equal(enrolled[0]?.active,true,'Automatic patient pre-registration failed');

async function upload(name,mime,path){
 const bytes=await readFile(new URL(path,import.meta.url));
 const [old]=await sql`SELECT id,name,mime,size FROM public.olhan_cloud_files_large WHERE patient_id=${patientId} AND name=${name} AND ready ORDER BY created_at LIMIT 1`;
 if(old){assert.equal(old.mime,mime);assert.equal(old.size,bytes.length);return {id:old.id,name:old.name,type:old.mime,size:old.size,data:'/api/files?id='+old.id};}
 const init=await invoke(mediaUploadHandler,{action:'init',patient:patientId,name,type:mime,size:bytes.length});assert.equal(init.code,200,'Fixture upload init failed');
 const pending=init.output;
 try{
  for(let index=0;index<pending.chunks;index++){
   const chunk=bytes.subarray(index*pending.chunkSize,(index+1)*pending.chunkSize);
   const sent=await invoke(mediaUploadHandler,{action:'chunk',patient:patientId,id:pending.id,index,base64:chunk.toString('base64')});assert.equal(sent.code,200,'Fixture upload chunk failed');
   if(index%3===2||index===pending.chunks-1){const assembled=await invoke(mediaUploadHandler,{action:'assemble',patient:patientId,id:pending.id,part:Math.floor(index/3)});assert.equal(assembled.code,200,'Fixture upload assembly failed');}
  }
  const done=await invoke(mediaUploadHandler,{action:'finish',patient:patientId,id:pending.id});assert.equal(done.code,200,'Fixture upload finish failed');return done.output;
 }catch(error){await invoke(mediaUploadHandler,{action:'abort',patient:patientId,id:pending.id}).catch(()=>{});throw error;}
}
const files=[await upload('Vídeo de teste.mp4','video/mp4','../portal/patient-demo-video.mp4'),await upload('Relatório de exemplo.pdf','application/pdf','../fixtures/patient-portal/documento-exemplo.pdf')];
await mutate(data=>{
 let changed=false;for(const f of files)if(!data.files.some(x=>x.id===f.id)){data.files.push({...f,cloudId:f.id,patient:patientId,folder:'Teste da área do paciente',date:date(0)});changed=true;}
 if(!data.records.some(r=>r.id===patientId+'-record')){data.records.push({id:patientId+'-record',patient:patientId,type:'Evolução de teste',date:date(0),pro:data.patients.find(p=>p.id===patientId).pro,appointment:null,draft:false,general:'Registro demonstrativo de atendimento concluído.',conduct:'Atividade funcional com exercícios de mobilidade e coordenação.',created:new Date().toISOString()});changed=true;}
 if(!data.appointments.some(a=>a.id===patientId+'-appointment')){data.appointments.push({id:patientId+'-appointment',patient:patientId,pro:data.patients.find(p=>p.id===patientId).pro,date:date(7),time:'09:00',duration:60,price:0,service:'Fisioterapia domiciliar',status:'Agendado',notes:'Agendamento de teste da área do paciente.'});changed=true;}
 return changed?data:null;
});

// Activation uses the ordinary handler, then login and file reads use live HTTPS.
const patient=makePatientHandler({sqlFactory:()=>sql,secret:process.env.BETTER_AUTH_SECRET,production:true,getAdmin:async()=>({user:actor})});
const invite=await invoke(patient,{action:'invite',patientId});assert.equal(invite.code,200);
const token=new URLSearchParams(new URL(invite.output.url).hash.slice(1)).get('ativar');
async function http(body,cookie='',query=''){
 const r=await fetch(origin+'/api/patient'+query,{method:body?'POST':'GET',headers:{...headers,...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 const data=await r.json();return {r,data};
}
assert.equal((await http({action:'activate',cpf,birth,token,password})).r.status,200,'Real activation failed');
const login=await http({action:'login',cpf,password});assert.equal(login.r.status,200,'Real CPF login failed');
const cookie=login.r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('__Host-olhan-patient='));
try{
 const view=await http(null,cookie);assert.equal(view.r.status,200);assert.equal(view.data.name,'Paula Olhan (Teste)');assert.ok(files.every(f=>view.data.media.some(m=>m.id===f.id)));
 assert.ok(view.data.records.some(r=>r.type==='Evolução de teste'));assert.ok(view.data.appointments.some(a=>a.status==='Agendado'));
 for(const file of files){
  const signed=await http(null,cookie,'?action=file&id='+encodeURIComponent(file.id));assert.equal(signed.r.status,200);
  const response=await fetch(signed.data.url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,'Private fixture file could not be read');
  const contents=Buffer.from(await response.arrayBuffer());assert.equal(contents.length,file.size);
  if(file.type==='application/pdf')assert.ok(contents.subarray(0,5).equals(Buffer.from('%PDF-')));
 }
 assert.equal((await http(null,'')).r.status,401);
 assert.equal((await http(null,cookie,'?action=file&id=00000000-0000-4000-8000-000000000000')).r.status,404);
}finally{assert.equal((await http({action:'logout'},cookie)).r.status,200);}
console.info('PATIENT_PORTAL_FIXTURE_READY: automatic account, real activation and CPF login, private video/PDF reads, record, appointment and logout verified.');
