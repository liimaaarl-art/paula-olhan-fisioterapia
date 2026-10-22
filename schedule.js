/* Olhan V16. A mesma decisão de recorrência para formulário, arraste e assistente. */
(() => {
  'use strict';
  const fields=['patient','pro','date','time','duration','price','service','status','notes'];
  const day=v=>{try{return /^\d{4}-\d{2}-\d{2}$/.test(v||'')&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v}catch{return false}};
  const clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'');
  const mins=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
  const addDay=(v,n)=>new Date(Date.parse(v+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const slot=a=>a.recurrenceSlot||a.recurrenceOrigin?.slot||new Date(a.date+'T12:00:00Z').getUTCDay()+':'+a.time;
  const cancelled=a=>String(a.status||'').includes('Cancelado');
  const fingerprint=a=>JSON.stringify(a);
  function prepare(data,aid,patch,scope='once',options={}){
    if(!['once','future'].includes(scope))throw Error('Escolha somente esta sessão ou as próximas.');
    const a=data.appointments.find(x=>x.id===aid);if(!a)throw Error('Atendimento não encontrado.');
    const isLocked=x=>data.invoices.some(i=>(i.items||[]).some(y=>y.id===x.id))||data.records.some(r=>r.appointment===x.id&&!r.draft);
    if(isLocked(a))throw Error('Atendimento fechado ou com registro clínico não pode ser alterado.');
    const clean={};for(const k of fields)if(Object.hasOwn(patch,k))clean[k]=patch[k];
    for(const k of ['duration','price'])if(Object.hasOwn(clean,k))clean[k]=Number(clean[k]);
    const requested={...a,...clean};
    if(!day(requested.date)||!clock(requested.time)||!Number.isInteger(requested.duration)||requested.duration<15||requested.duration>480||!Number.isFinite(requested.price)||requested.price<0)throw Error('Confira data, horário, duração e valor.');
    if(!data.patients.some(x=>x.id===requested.patient)||!data.team.some(x=>x.id===requested.pro))throw Error('Paciente ou profissional inválido.');
    if(!['Agendado','Remarcado','Realizado','Cancelado sem cobrança','Cancelado com cobrança','Faltou','Não compareceu','Não realizado'].includes(requested.status))throw Error('Situação inválida.');
    const original=a.recurrenceOrigin||{date:a.date,time:a.time,slot:slot(a)};
    const following=data.appointments.filter(x=>x.id!==a.id&&a.seriesId&&x.seriesId===a.seriesId&&slot(x)===slot(a)&&(x.recurrenceOrigin?.date||x.date)>=original.date);
    const eligible=following.filter(x=>!cancelled(x)&&!isLocked(x)&&!x.recurrenceException);
    if(scope==='future'&&!a.seriesId)throw Error('Esta sessão não tem recorrência vinculada.');
    if(scope==='future'&&clean.status==='Realizado'&&eligible.some(x=>x.date>(options.today||'9999-12-31')))throw Error('Não é possível marcar sessões futuras como realizadas.');
    const targets=scope==='future'?[a,...eligible]:[a];
    const deltaDays=Math.round((Date.parse(requested.date+'T12:00:00Z')-Date.parse((scope==='future'?original.date:a.date)+'T12:00:00Z'))/864e5);
    const deltaMinutes=mins(requested.time)-mins(scope==='future'?original.time:a.time);
    const changed=fields.filter(k=>Object.hasOwn(clean,k)&&String(a[k]??'')!==String(clean[k]??''));
    const changes=targets.map(x=>{
      let next={...x};
      for(const k of changed)if(!['date','time'].includes(k))next[k]=clean[k];
      if(x.id===aid)next={...next,date:requested.date,time:requested.time};
      else{
        if(changed.includes('date')||a.recurrenceException&&Object.hasOwn(clean,'date'))next.date=addDay(x.date,deltaDays);
        if(changed.includes('time')||a.recurrenceException&&Object.hasOwn(clean,'time')){const t=mins(x.time)+deltaMinutes;next.time=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');}
      }
      if(!clock(next.time)||mins(next.time)+next.duration>1440)throw Error('A alteração ultrapassaria o limite do dia.');
      if(a.seriesId){
        const timing=changed.includes('date')||changed.includes('time');
        if(scope==='future'&&!timing){next.recurrenceSlot=slot(x);next.recurrenceException=!!x.recurrenceException;next.recurrenceOrigin=x.recurrenceOrigin;}
        else{next.recurrenceSlot=scope==='future'?new Date(requested.date+'T12:00:00Z').getUTCDay()+':'+requested.time:slot(x);next.recurrenceException=scope==='once';next.recurrenceOrigin=scope==='once'?(x.recurrenceOrigin||{date:x.date,time:x.time,slot:slot(x)}):undefined;}
      }
      return {id:x.id,before:fingerprint(x),after:next};
    });
    const ids=new Set(targets.map(x=>x.id)),gap=Number(data.care?.preferences?.travelMinutes||0);
    const pool=[...data.appointments.filter(x=>!ids.has(x.id)),...changes.map(x=>x.after)];
    for(const {after:x} of changes){if(cancelled(x))continue;const conflict=pool.find(y=>y.id!==x.id&&x.pro===y.pro&&x.date===y.date&&!cancelled(y)&&mins(x.time)<mins(y.time)+Number(y.duration)+gap&&mins(y.time)<mins(x.time)+Number(x.duration)+gap);if(conflict)throw Error('Conflito de horário ou deslocamento em '+x.date+' às '+x.time+'. Nenhuma sessão foi alterada.');}
    return {aid,scope,changed,changes,eligible:eligible.length,skipped:following.length-eligible.length,replacement:!!options.replacement};
  }
  window.OlhanSchedule={prepare,slot,day,clock,fingerprint};
  if(typeof db==='undefined')return;
  let pending=null;
  function apply(plan){
    if(!plan.changes.every(c=>fingerprint(db.appointments.find(x=>x.id===c.id))===c.before))throw Error('A agenda mudou durante a revisão. Abra novamente e confira.');
    const before=JSON.stringify(db);
    try{
      for(const change of plan.changes){const a=db.appointments.find(x=>x.id===change.id);const next=change.after;const entry=new Date().toLocaleString('pt-BR')+`: ${a.date} ${a.time} → ${next.date} ${next.time} · ${plan.scope==='future'?'recorrência futura':'somente esta sessão'}`;
        if(plan.replacement&&a.id===plan.aid&&cancelled(a)){
          if(a.replacementId)throw Error('Este cancelamento já tem reposição.');
          const replacement={...next,id:id(),status:'Remarcado',seriesId:null,replacementOf:a.id,history:[entry]};delete replacement.replacementId;db.appointments.push(replacement);a.replacementId=replacement.id;a.history=[...(a.history||[]),entry+' · reposição '+replacement.id];
        }else Object.assign(a,next,{history:[...(a.history||[]),entry]});
      }
      const care=OlhanCare.model();care.audit.push({at:new Date().toISOString(),kind:'alterar-agenda-'+plan.scope,ref:plan.aid});
      if(!save()){db=JSON.parse(before);return false;}pending=null;closeModal();render();toast(plan.changes.length+' sessão(ões) atualizada(s).');return true;
    }catch(e){db=JSON.parse(before);throw e;}
  }
  window.scheduleConfirm=function(scope){if(!pending)return;try{const plan=prepare(db,pending.aid,pending.patch,scope,pending.options);return apply(plan)}catch(e){toast(e.message)}};
  window.scheduleRequest=function(aid,patch,options={}){
    const a=db.appointments.find(x=>x.id===aid);if(!a)return;
    let one;try{one=prepare(db,aid,patch,'once',{...options,today});}catch(e){return toast(e.message)}
    if(!one.changed.length&&!options.replacement)return toast('Nenhuma alteração informada.');
    let future;try{future=prepare(db,aid,patch,'future',{...options,today});}catch(e){future={error:e.message};}
    pending={aid,patch:{...patch},options:{...options,today}};
    const label=patient(a.patient).name;
    modal('Como deseja alterar a agenda?',`<p><b>${esc(label)}</b></p><p class="note">De ${fmt(a.date)} às ${esc(a.time)} para ${fmt(patch.date||a.date)} às ${esc(patch.time||a.time)}.</p><div class="v16-scope"><button type="button" class="btn" onclick="scheduleConfirm('once')">Somente esta sessão</button><button type="button" class="btn secondary" onclick="scheduleConfirm('future')" ${future.error?'disabled':''}>Esta e as próximas ${future.error?'':`(${future.changes.length} sessões)`}</button><button type="button" class="btn secondary" onclick="closeModal()">Cancelar sem alterar</button></div><p class="note">${a.seriesId?'A recorrência inclui apenas as próximas sessões cadastradas deste mesmo dia da semana e horário. Outros dias, exceções já reagendadas, sessões canceladas, com evolução ou faturadas são preservados.':'Esta é uma sessão avulsa, sem recorrência vinculada.'}</p>${future?.skipped?`<p class="note">${future.skipped} sessão(ões) protegida(s) ou exceções não serão alteradas.</p>`:''}${future.error&&a.seriesId?`<p class="v16-error">Recorrência indisponível: ${esc(future.error)}</p>`:''}`,null);
  };
  const previousAppointment=window.appointmentForm;
  window.appointmentForm=function(aid,preset){
    if(!aid)return previousAppointment(aid,preset);
    const a=db.appointments.find(x=>x.id===aid);if(!a)return;
    const locked=billed(a)||db.records.some(r=>r.appointment===aid&&!r.draft);
    modal('Editar atendimento',`${locked?'<p class="note">Este atendimento possui evolução ou fechamento. Horários e dados permanecem protegidos.</p>':''}<div class="formgrid">${select('patient','Paciente',db.patients.map(x=>[x.id,x.name]),a.patient)}${select('pro','Profissional',db.team.map(x=>[x.id,x.name]),a.pro)}${field('date','Data',a.date,'date','required')}${field('time','Horário',a.time,'time','required')}${field('duration','Duração (min)',a.duration,'number','required min="15" max="480"')}${field('price','Valor da sessão',a.price,'number','required min="0" step="0.01"')}${select('service','Serviço',['Fisioterapia domiciliar','Avaliação inicial'],a.service)}${select('status','Situação',['Agendado','Realizado','Remarcado','Cancelado sem cobrança','Cancelado com cobrança'],a.status)}${area('notes','Observações',a.notes)}</div><div class="v16-scope"><button type="button" class="btn secondary" onclick="recordForm('${esc(a.patient)}','${esc(a.id)}')">Registrar evolução / avaliação</button><button type="button" class="btn secondary" onclick="careShowRoute('${esc(a.id)}')">Abrir rota</button></div>`,locked?null:d=>scheduleRequest(aid,d),'Revisar alteração');
    if(locked)document.querySelectorAll('#form input,#form select,#form textarea').forEach(x=>x.disabled=true);
  };
  window.careReschedule=function(aid){const a=db.appointments.find(x=>x.id===aid);if(!a)return;modal('Repor ou substituir atendimento',`<div class="formgrid">${field('date','Nova data',a.date,'date','required')}${field('time','Novo horário',a.time,'time','required')}${select('pro','Profissional',db.team.map(t=>[t.id,t.name]),a.pro)}${area('reason','Motivo da alteração')}</div>`,d=>{if(!d.reason.trim())return toast('Informe o motivo.');scheduleRequest(aid,{date:d.date,time:d.time,pro:d.pro,status:'Remarcado',notes:(a.notes||'')+'\nMotivo: '+d.reason.trim()},{replacement:cancelled(a)})},'Revisar alteração')};
  window.dropAppointment=function(date,time,ev){ev?.preventDefault();const aid=window.draggedAppointmentId||ev?.dataTransfer?.getData('text/plain');window.draggedAppointmentId=null;const a=db.appointments.find(x=>x.id===aid);if(!a)return;if(cancelled(a))return toast('Use Repor / substituir para uma sessão cancelada.');scheduleRequest(aid,{date,time,status:a.status==='Agendado'?'Remarcado':a.status})};
  window.OlhanSchedule.apply=apply;
})();
