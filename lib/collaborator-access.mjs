import '../clinical-fields.js';
const {assessmentSections,painRegions,evolutionVitals}=globalThis.OlhanClinicalFields;
export const COLLABORATORS = Object.freeze({
  'tanaka.ana91@gmail.com': Object.freeze({ name:'Ana Cláudia Tanaka Pinto', title:'Fisioterapeuta colaboradora', permissions:Object.freeze(['pendencias','agenda','assistente','pacientes','prontuarios','avaliacoes','relatorios','aniversarios','exercicios','contrato_colaborador']) })
});
export const normalizeEmail = value => String(value || '').trim().toLowerCase();
const clone = value => structuredClone(value);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const uniqueRows = (rows, label) => {
  if (!Array.isArray(rows)) throw Error(`Dados inválidos: ${label}.`);
  const ids=new Set();
  for(const row of rows){if(!row||!validId(row.id)||ids.has(row.id))throw Error(`Dados inválidos: ${label}.`);ids.add(row.id);}
  return rows;
};
const own = (ctx, patient) => ctx.patientIds.has(patient);
export function collaboratorContext(workspace,email) {
  const account=COLLABORATORS[normalizeEmail(email)];
  if(!account||!workspace||typeof workspace!=='object')throw Error('Acesso de colaboradora indisponível.');
  const team=uniqueRows(workspace.team,'equipe');
  const patients=uniqueRows(workspace.patients,'pacientes');
  const matching=team.filter(t=>normalizeEmail(t.email)===normalizeEmail(email));
  if(matching.length!==1||matching[0].role!=='Fisioterapeuta colaboradora'||matching[0].active===false)throw Error('Vínculo profissional inválido.');
  const member=matching[0];
  return {account,teamId:member.id,member,patientIds:new Set(patients.filter(p=>p.pro===member.id).map(p=>p.id))};
}
const array=(d,key)=>uniqueRows(d[key]||[],key);
export function projectCollaboratorWorkspace(result,email) {
  const data=result?.data;const ctx=collaboratorContext(data,email);
  const patients=array(data,'patients').filter(p=>own(ctx,p.id)).map(p=>{
    const allowed=['id','name','birth','responsible','phone','address','pro','frequency','status','treatmentStartDate'];
    return Object.fromEntries(allowed.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  });
  const patientIds=new Set(patients.map(p=>p.id));
  const appointmentFields=['id','patient','pro','date','time','duration','service','status','notes','history'];
  const appointments=array(data,'appointments').filter(a=>patientIds.has(a.patient)).map(a=>Object.fromEntries(appointmentFields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]])));
  const records=array(data,'records').filter(r=>patientIds.has(r.patient));
  const files=array(data,'files').filter(f=>patientIds.has(f.patient));
  const allCare=data.care&&typeof data.care==='object'?data.care:{};
  const care={
    exercises:Array.isArray(allCare.exercises)?allCare.exercises.map(e=>Object.fromEntries(['id','title','category','url','instructions','created','updated','materialType'].filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))):[],
    assignments:(allCare.assignments||[]).filter(x=>patientIds.has(x.patient)),
    goals:(allCare.goals||[]).filter(x=>patientIds.has(x.patient)),
    plans:Object.fromEntries(Object.entries(allCare.plans||{}).filter(([pid])=>patientIds.has(pid)))
  };
  const contracts=array(data,'contracts').filter(c=>c.contractType==='team'&&c.professionalId===ctx.teamId&&!c.patient);
  const memberFields=['id','name','email','role','phone','address','crefito','maritalStatus'];
  const member=Object.fromEntries(memberFields.filter(k=>ctx.member[k]!==undefined).map(k=>[k,ctx.member[k]]));
  return {revision:result.revision,role:'collaborator',user:{name:ctx.member.name,email:ctx.member.email},permissions:ctx.account.permissions,data:{team:[member],patients,appointments,records,files,fileFolders:fileFolders(data),care,contracts}};
}
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00.000Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;};
const text=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const fileFolders=d=>[...new Set(['Geral','Registros de atendimento','Exames','Documentos',...(Array.isArray(d.fileFolders)?d.fileFolders.filter(x=>typeof x==='string'&&x.length<=120):[])])];
const validNumber=(v,max=Number.MAX_SAFE_INTEGER)=>v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=max;
const cleanEvolution=p=>{
  if(!text(p.general))throw Error('Preencha o relato clínico.');
  const out={general:p.general,goal:String(p.goal||'').slice(0,3000),conduct:String(p.conduct||'').slice(0,6000)};
  for(const [k,label,,max] of evolutionVitals){
    const value=String(p[k]??'').trim();
    if(value&&(max!==undefined?!validNumber(value,max):value.length>80))throw Error('Confira o campo: '+label+'.');
    out[k]=value;
  }
  return out;
};
const assessmentFields=assessmentSections.flatMap(x=>x.fields);
const painPoints=new Set(['Frente','Costas'].flatMap(side=>painRegions.map(([,label])=>side+': '+label)));
function cleanAssessment(input,draft){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ficha de avaliação inválida.');
  const out={};
  for(const [key,label,type,choices,max] of assessmentFields){
    const v=input[key];if(v===undefined||v==='')continue;
    if(type==='multi'){
      if(!Array.isArray(v)||v.some(x=>!choices.includes(x)))throw Error('Confira o campo: '+label+'.');
      if(v.length)out[key]=[...new Set(v)];continue;
    }
    if(typeof v!=='string'||v.length>6000||type==='choice'&&!choices.includes(v)||type==='number'&&!validNumber(v,max)||type==='pain'&&!/^(10|[0-9])$/.test(v))throw Error('Confira o campo: '+label+'.');
    if(v.trim())out[key]=v.trim();
  }
  if(input.painPoints!==undefined){
    if(!Array.isArray(input.painPoints)||input.painPoints.some(x=>!painPoints.has(x)))throw Error('Mapa corporal inválido.');
    out.painPoints=[...new Set(input.painPoints)];
  }
  if(!draft&&(!out.complaint||!out.objective))throw Error('Para concluir, preencha a queixa principal e o objetivo fisioterapêutico.');
  return out;
}
export function applyCollaboratorAction(result,email,action,payload,makeId) {
  const data=result?.data;const ctx=collaboratorContext(data,email);const next=clone(data);const id=()=>makeId();
  if(!payload||typeof payload!=='object')throw Error('Dados inválidos.');
  const patients=new Set(data.patients.filter(p=>p.pro===ctx.teamId).map(p=>p.id));
  if(action==='appointment.create'){
    if(!patients.has(payload.patient)||!date(payload.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.time||''))throw Error('Confira paciente, data e horário.');
    next.appointments.push({id:id(),patient:payload.patient,pro:ctx.teamId,date:payload.date,time:payload.time,duration:Math.min(240,Math.max(15,Number(payload.duration)||60)),service:text(payload.service,120)?payload.service:'Fisioterapia domiciliar',status:'Agendado',notes:String(payload.notes||'').slice(0,1000),history:[]});
  } else if(action==='appointment.update'){
    const row=next.appointments.find(a=>a.id===payload.id);if(!row||!patients.has(row.patient))throw Error('Atendimento não autorizado.');
    if(data.records.some(r=>r.appointment===row.id&&!r.draft))throw Error('Este atendimento já tem registro clínico e está bloqueado.');
    if(!date(payload.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.time||''))throw Error('Confira a data e o horário.');
    if(!['Agendado','Remarcado','Realizado','Cancelado sem cobrança'].includes(payload.status))throw Error('Status inválido.');row.status=payload.status;row.notes=String(payload.notes??row.notes??'').slice(0,1000);
    row.date=payload.date;row.time=payload.time;
  } else if(action==='record.create'||action==='record.update'){
    const existing=action==='record.update'?next.records.find(r=>r.id===payload.id):null;
    if(action==='record.update'&&(!existing||!own(ctx,existing.patient)||existing.pro!==ctx.teamId))throw Error('Registro não autorizado para edição.');
    const patient=existing?.patient??payload.patient,type=existing?.type??payload.type;
    if(!patients.has(patient)||!['Evolução','Avaliação'].includes(type))throw Error('Confira paciente e tipo de registro.');
    const appointmentId=existing?existing.appointment:payload.appointment;
    const appointment=appointmentId?next.appointments.find(a=>a.id===appointmentId&&a.patient===patient&&a.pro===ctx.teamId):null;
    if(appointmentId&&!appointment)throw Error('Atendimento não autorizado.');
    if(!existing&&appointment&&String(appointment.status).includes('Cancelado'))throw Error('O atendimento foi cancelado.');
    const day=existing?.date??appointment?.date??payload.date;
    if(!date(day)||day>today())throw Error('A data do registro deve ser hoje ou anterior.');
    const draft=type==='Avaliação'&&payload.draft===true;
    if(draft&&existing&&!existing.draft)throw Error('Uma avaliação concluída não pode voltar a rascunho.');
    const structured=type==='Avaliação'&&payload.assessment!==undefined;
    if(type==='Avaliação'&&existing?.assessment&&!structured)throw Error('Informe os dados da ficha de avaliação.');
    const assessment=structured?cleanAssessment(payload.assessment,draft):undefined;
    const clinical=assessment?{assessment,general:assessment.complaint||'',goal:assessment.objective||'',conduct:assessment.physioDiagnosis||'',...Object.fromEntries(['pa','fc','spo','pain'].map(k=>[k,assessment[k]??'']))}:cleanEvolution(payload);
    if(appointment&&!draft&&next.records.some(r=>r.id!==existing?.id&&r.appointment===appointment.id&&r.type===type&&!r.draft))throw Error('Este atendimento já tem esse tipo de registro. Abra o prontuário para consultar.');
    const now=new Date().toISOString();
    if(existing){
      const {versions:_versions,attachments:_attachments,...snapshot}=existing;
      if(type==='Avaliação'&&!existing.evaluationKind)existing.evaluationKind=payload.evaluationKind==='Reavaliação'?'Reavaliação':'Inicial';
      if(!existing.draft)existing.versions=[...(existing.versions||[]),{editedAt:now,snapshot}];
      Object.assign(existing,clinical,{draft,updated:now,...(type==='Avaliação'&&!draft?{completed:existing.completed||now,lastEdited:now}:{})});
    }else{
      const kind=payload.evaluationKind==='Reavaliação'?'Reavaliação':'Inicial';
      next.records.push({id:id(),patient,pro:ctx.teamId,appointment:appointment?.id||null,date:day,type,...clinical,created:now,draft,...(type==='Avaliação'?{evaluationKind:kind,...(!draft?{completed:now}:{})}:{})});
    }
    const billed=(next.invoices||[]).some(i=>(i.items||[]).some(x=>x.id===appointment?.id));
    if(appointment&&!draft&&!billed&&['Agendado','Remarcado'].includes(appointment.status)){
      appointment.status='Realizado';appointment.history=[...(appointment.history||[]),'Marcado realizado ao registrar '+type.toLowerCase()+' em '+now];
    }
  } else if(action==='file.register'){
    if(payload.folder&&!fileFolders(next).includes(payload.folder))throw Error('Pasta inválida.');
    if(!patients.has(payload.patient)||!payload.file||!validId(payload.file.id)||!String(payload.file.data||'').startsWith('/api/files?id='))throw Error('Arquivo não autorizado.');
    next.files??=[];if(next.files.some(f=>f.id===payload.file.id))return next;next.files.push({id:payload.file.id,cloudId:payload.file.id,patient:payload.patient,name:String(payload.file.name||'').slice(0,240),type:String(payload.file.type||''),size:Number(payload.file.size)||0,folder:payload.folder||'Geral',date:date(payload.date)?payload.date:new Date().toISOString().slice(0,10),data:'/api/files?id='+payload.file.id});
  } else if(action==='exercise.create'){
    next.care??={};next.care.exercises??=[];if(!text(payload.title,120))throw Error('Informe o nome do exercício.');
    const url=String(payload.url||'');if(url&&!/^https:\/\//i.test(url))throw Error('Use um link HTTPS.');
    next.care.exercises.push({id:id(),title:payload.title.trim(),category:String(payload.category||'').slice(0,80),url,instructions:String(payload.instructions||'').slice(0,3000),created:new Date().toISOString()});
  } else if(action==='exercise.assign'){
    next.care??={};next.care.assignments??=[];if(!patients.has(payload.patient)||!next.care.exercises.some(e=>e.id===payload.exercise))throw Error('Paciente ou exercício não autorizado.');
    next.care.assignments.push({id:id(),patient:payload.patient,exercise:payload.exercise,instructions:String(payload.instructions||'').slice(0,2000),active:true,created:new Date().toISOString()});
  } else if(action==='goal.create'){
    next.care??={};next.care.goals??=[];if(!patients.has(payload.patient)||!text(payload.title,200))throw Error('Paciente ou meta inválida.');
    next.care.goals.push({id:id(),patient:payload.patient,title:payload.title.trim(),description:String(payload.description||'').slice(0,3000),targetDate:date(payload.targetDate)?payload.targetDate:'',done:false,created:new Date().toISOString()});
  } else throw Error('Operação não permitida.');
  return next;
}
