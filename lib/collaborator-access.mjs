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
    const allowed=['id','name','birth','responsible','phone','address','pro','frequency','status'];
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
  return {revision:result.revision,role:'collaborator',user:{name:ctx.member.name,email:ctx.member.email},permissions:ctx.account.permissions,data:{team:[member],patients,appointments,records,files,care,contracts}};
}
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00.000Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;};
const text=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
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
  } else if(action==='record.create'){
    if(!patients.has(payload.patient)||!date(payload.date)||!['Evolução','Avaliação'].includes(payload.type)||!text(payload.general))throw Error('Confira o tipo, a data e o conteúdo do registro.');
    let appointment=null;if(payload.appointment){appointment=next.appointments.find(a=>a.id===payload.appointment&&a.patient===payload.patient&&a.pro===ctx.teamId);if(!appointment)throw Error('Atendimento não autorizado.');}
    next.records.push({id:id(),patient:payload.patient,pro:ctx.teamId,appointment:appointment?.id||null,date:payload.date,type:payload.type,general:payload.general.slice(0,12000),goal:String(payload.goal||'').slice(0,3000),conduct:String(payload.conduct||'').slice(0,6000),created:new Date().toISOString(),draft:false});
    if(appointment&&['Agendado','Remarcado'].includes(appointment.status))appointment.status='Realizado';
  } else if(action==='file.register'){
    if(!patients.has(payload.patient)||!payload.file||!validId(payload.file.id)||!String(payload.file.data||'').startsWith('/api/files?id='))throw Error('Arquivo não autorizado.');
    next.files??=[];if(next.files.some(f=>f.id===payload.file.id))return next;next.files.push({id:payload.file.id,cloudId:payload.file.id,patient:payload.patient,name:String(payload.file.name||'').slice(0,240),type:String(payload.file.type||''),size:Number(payload.file.size)||0,date:date(payload.date)?payload.date:new Date().toISOString().slice(0,10),data:'/api/files?id='+payload.file.id});
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
