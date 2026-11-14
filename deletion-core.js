/* Shared deletion rules. Exclusions are reversible; clinical and financial history stays intact. */
(() => {
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const rows=(data,key)=>Array.isArray(data[key])?data[key]:[];
 const stamp=a=>String(a.date||'')+'T'+String(a.time||'00:00');
 const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
 const samePlan=(a,b)=>canonical(a)===canonical(b);
 function protectedAppointment(data,a){
  return ['Realizado','Cancelado com cobrança'].includes(a.status)
   || rows(data,'records').some(r=>r.appointment===a.id)
   || rows(data,'invoices').some(i=>(i.items||[]).some(x=>x.id===a.id))
   || rows(data,'cashEntries').some(e=>e.appointment===a.id||(e.appointmentIds||[]).includes(a.id))
   || !!a.replacementOf || !!a.replacementId;
 }
 function prepare(data,kind,ref,scope='once'){
  if(!['appointment','patient','restore'].includes(kind))throw Error('Operação inválida.');
  if(kind==='restore'){
   const item=rows(data,'recycleBin').find(x=>x.id===ref);
   if(!item)throw Error('Item não encontrado na lixeira.');
   if(item.kind==='patient'){
    if(rows(data,'patients').some(p=>p.id===item.patient.id))throw Error('Este cadastro já existe.');
    const cpf=String(item.patient.cpf||'').replace(/\D/g,'');
    if(cpf&&rows(data,'patients').some(p=>String(p.cpf||'').replace(/\D/g,'')===cpf))throw Error('Já existe outro cadastro com este CPF. Confira os cadastros antes de restaurar.');
   }else if(item.kind==='appointments'){
    for(const a of item.items){
     if(!rows(data,'patients').some(p=>p.id===a.patient))throw Error('Restaure primeiro o cadastro do paciente.');
     if(!rows(data,'team').some(p=>p.id===a.pro))throw Error('Confira o profissional antes de restaurar.');
     if(rows(data,'appointments').some(x=>x.id===a.id))throw Error('Este atendimento já existe.');
     const minutes=x=>Number(x.time.slice(0,2))*60+Number(x.time.slice(3));
     const cancelled=x=>String(x.status||'').includes('Cancelado');
     const gap=Number(data.care?.preferences?.travelMinutes)||0;
     const conflict=[...rows(data,'appointments'),...item.items].some(x=>x.id!==a.id&&!cancelled(a)&&!cancelled(x)&&x.pro===a.pro&&x.date===a.date&&minutes(a)<minutes(x)+Number(x.duration)+gap&&minutes(x)<minutes(a)+Number(a.duration)+gap);
     if(conflict)throw Error('Há conflito de horário ou deslocamento em '+a.date+' às '+a.time+'. Nenhum item foi restaurado.');
    }
   }else throw Error('Item inválido na lixeira.');
   return {kind,ref,item:copy(item),label:item.label,count:item.kind==='patient'?1:item.items.length};
  }
  if(kind==='patient'){
   const p=rows(data,'patients').find(x=>x.id===ref);if(!p)throw Error('Paciente não encontrado.');
   const appointments=rows(data,'appointments').filter(a=>a.patient===ref&&!protectedAppointment(data,a));
   return {kind,ref,label:p.name,patient:copy(p),appointments:copy(appointments),count:appointments.length,retained:rows(data,'appointments').filter(a=>a.patient===ref).length-appointments.length,records:rows(data,'records').filter(r=>r.patient===ref).length,files:rows(data,'files').filter(f=>f.patient===ref).length};
  }
  if(!['once','future'].includes(scope))throw Error('Escolha somente este agendamento ou este e os próximos.');
  const a=rows(data,'appointments').find(x=>x.id===ref);if(!a)throw Error('Agendamento não encontrado.');
  if(protectedAppointment(data,a))throw Error('Este atendimento tem realização, registro clínico, cobrança, fechamento ou reposição vinculada e não pode ser excluído.');
  if(scope==='future'&&!a.seriesId)throw Error('Este agendamento não faz parte de uma recorrência.');
  const candidates=rows(data,'appointments').filter(x=>x.id===a.id||(scope==='future'&&x.seriesId===a.seriesId&&x.patient===a.patient&&stamp(x)>=stamp(a)));
  const appointments=candidates.filter(x=>!protectedAppointment(data,x));
  return {kind,ref,scope,label:(rows(data,'patients').find(p=>p.id===a.patient)?.name||'Paciente')+' · '+a.date+' '+a.time,appointments:copy(appointments),count:appointments.length,retained:candidates.length-appointments.length};
 }
 function apply(data,plan,{makeId,now,actor}={}){
  // Recompute against the current state. Callers also compare the workspace revision.
  const fresh=prepare(data,plan.kind,plan.ref,plan.scope);
  if(!samePlan(fresh,plan))throw Error('Os dados mudaram durante a revisão. Abra novamente e confira.');
  const next=copy(data);next.recycleBin=rows(next,'recycleBin');
  if(plan.kind==='restore'){
   if(plan.item.kind==='patient')next.patients.push(copy(plan.item.patient));
   else next.appointments.push(...copy(plan.item.items));
   next.recycleBin=next.recycleBin.filter(x=>x.id!==plan.ref);
  }else{
   const metadata={deletedAt:now,deletedBy:actor};
   if(plan.kind==='patient'){
    next.patients=next.patients.filter(x=>x.id!==plan.ref);
    next.recycleBin.push({id:makeId(),kind:'patient',label:plan.label,patient:copy(plan.patient),...metadata});
   }
   if(plan.appointments.length){
    const ids=new Set(plan.appointments.map(x=>x.id));
    next.appointments=next.appointments.filter(x=>!ids.has(x.id));
    next.recycleBin.push({id:makeId(),kind:'appointments',label:plan.label,items:copy(plan.appointments),...metadata});
   }
  }
  next.care??={};next.care.audit=rows(next.care,'audit');
  next.care.audit.push({at:now,kind:plan.kind==='restore'?'restaurar-lixeira':'excluir-'+plan.kind,ref:plan.ref,scope:plan.scope,count:plan.count,by:actor});
  return next;
 }
 globalThis.OlhanDeletionCore=Object.freeze({prepare,apply,protectedAppointment,samePlan});
})();
