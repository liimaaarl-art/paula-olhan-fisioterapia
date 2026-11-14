(() => {
 'use strict';
 if(typeof db==='undefined')return;
 const core=window.OlhanDeletionCore;
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn secondary small deletion-button';b.textContent=label;b.onclick=fn;return b;};
 const activePatient=pid=>db.patients.some(p=>p.id===pid);
 let reviewed=null,busy=false;
 const error=message=>{const e=document.getElementById('deletion-error');if(e)e.textContent=message;else toast(message);};
 const when=value=>value?new Date(value).toLocaleString('pt-BR'):'';
 function list(items){return `<details class="deletion-items"><summary>Ver ${items.length} agendamento(s)</summary><ul>${items.map(a=>`<li>${esc(fmt(a.date))} às ${esc(a.time)} · ${esc(professional(a.pro))} · ${esc(a.status)}</li>`).join('')}</ul></details>`;}
 function contents(plan){
  if(plan.kind==='restore')return `<p>Restaurar <b>${esc(plan.label)}</b>?</p><p class="note">${plan.item.kind==='patient'?'O cadastro voltará à lista de pacientes. Os agendamentos excluídos permanecem na lixeira e podem ser restaurados separadamente. Se necessário, gere um novo link de ativação para o paciente.':'Os agendamentos voltarão à agenda. A restauração será bloqueada se houver conflito de horário ou deslocamento.'}</p>${plan.item.kind==='appointments'?list(plan.item.items):''}`;
  if(plan.kind==='patient')return `<p>Excluir o cadastro de <b>${esc(plan.label)}</b>?</p><p>O paciente sairá das listas e perderá o acesso à área do paciente. <b>${plan.count} agendamento(s) sem vínculo clínico ou financeiro</b> também irão para a lixeira.</p><p class="note">Prontuários, avaliações, anexos, contratos e financeiro permanecem preservados. ${plan.retained} atendimento(s) protegido(s) serão mantidos no histórico e na agenda. O cadastro poderá ser restaurado pela administração.</p>${list(plan.appointments)}`;
  return `<p><b>${esc(plan.label)}</b></p><p><b>${plan.count} agendamento(s)</b> irão para a lixeira e sairão da agenda.</p>${plan.retained?`<p class="note">${plan.retained} atendimento(s) com realização, registros, cobrança ou reposição serão preservados.</p>`:''}${list(plan.appointments)}<p class="note">Você poderá restaurar pela lixeira. Nenhum prontuário ou lançamento financeiro será apagado.</p>`;
 }
 function updateScope(scope){
  try{const plan=core.prepare(db,'appointment',reviewed.ref,scope);reviewed=plan;document.getElementById('deletion-preview').innerHTML=contents(plan);error('');document.getElementById('deletion-confirm').checked=false;}catch(e){error(e.message);}
 }
 window.olhanDeleteRequest=function(kind,ref){
  if(busy)return;
  try{
   const plan=core.prepare(db,kind,ref);reviewed=plan;
   const recurring=kind==='appointment'&&db.appointments.find(a=>a.id===ref)?.seriesId;
   modal(kind==='patient'?'Excluir paciente':'Excluir agendamento',`${recurring?`<fieldset class="deletion-scope"><legend>Quais agendamentos deseja excluir?</legend><label><input type="radio" name="deleteScope" value="once" checked> Somente este agendamento</label><label><input type="radio" name="deleteScope" value="future"> Este e os próximos da recorrência</label><p class="note">Inclui os demais dias e horários desta mesma série, a partir do agendamento selecionado. Outras recorrências e sessões avulsas são preservadas.</p></fieldset>`:''}<div id="deletion-preview">${contents(plan)}</div><label class="deletion-confirm"><input id="deletion-confirm" type="checkbox" required> Conferi os itens e confirmo a exclusão.</label><p id="deletion-error" role="alert"></p>`,()=>window.olhanDeletionConfirm(),'Confirmar exclusão');
   document.querySelectorAll('[name="deleteScope"]').forEach(el=>el.onchange=()=>updateScope(el.value));
  }catch(e){toast(e.message);}
 };
 window.olhanDeletionConfirm=async function(){
  if(!reviewed||busy||!document.getElementById('deletion-confirm')?.checked)return;
  const plan=reviewed;busy=true;const buttons=[...document.querySelectorAll('#form button,#form input')];buttons.forEach(b=>b.disabled=true);error('Salvando no servidor…');
  try{
   if(window.OlhanCloud){await window.OlhanCloud.deletion(plan);}
   else{
    const previous=JSON.stringify(db);
    db=core.apply(db,plan,{makeId:id,now:new Date().toISOString(),actor:'local'});
    if(!save()){db=JSON.parse(previous);throw Error('Não foi possível salvar. A exclusão não foi aplicada.');}
   }
   if(plan.kind==='patient'&&patientId===plan.ref)patientId=null;
   reviewed=null;closeModal();render();toast(plan.kind==='restore'?'Item restaurado.':'Exclusão salva. Os itens estão na lixeira.');
  }catch(e){error(e.message);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
 };
 window.olhanRestoreRequest=function(ref){
  if(busy)return;
  try{reviewed=core.prepare(db,'restore',ref);modal('Restaurar da lixeira',`${contents(reviewed)}<label class="deletion-confirm"><input id="deletion-confirm" type="checkbox" required> Confirmo a restauração.</label><p id="deletion-error" role="alert"></p>`,()=>window.olhanDeletionConfirm(),'Restaurar');}catch(e){toast(e.message);}
 };
 window.olhanOpenTrash=function(){
  const items=(db.recycleBin||[]).slice().reverse();
  modal('Lixeira',`<p class="note">Itens excluídos pela administração. O histórico clínico e financeiro permanece preservado. Restaure primeiro o paciente e depois seus agendamentos, se desejar.</p><div class="deletion-trash">${items.map(item=>`<article class="record"><h3>${esc(item.label)}</h3><p>${item.kind==='patient'?'Cadastro de paciente':item.items.length+' agendamento(s)'} · ${esc(when(item.deletedAt))}</p><div class="deletion-actions">${btn('Restaurar',`olhanRestoreRequest('${esc(item.id)}')`,'back','secondary small')}${item.kind==='patient'?btn('Ver histórico preservado',`olhanDeletedHistory('${esc(item.patient.id)}')`,'file','secondary small'):''}</div>${item.kind==='appointments'?list(item.items):''}</article>`).join('')||'<div class="empty">Nenhum item na lixeira.</div>'}</div>`,null);
 };
 window.olhanDeletedHistory=function(pid){
  const p=(db.recycleBin||[]).find(i=>i.kind==='patient'&&i.patient.id===pid)?.patient;if(!p)return;
  const records=db.records.filter(r=>r.patient===pid),files=db.files.filter(f=>f.patient===pid),invoices=db.invoices.filter(i=>i.patient===pid);
  modal('Histórico preservado',`<h3>${esc(p.name)}</h3><p class="note">Consulta do histórico de um cadastro excluído. Restaure o cadastro para retomar o atendimento.</p>${records.map(r=>`<article class="record"><h3>${esc(r.type)} · ${esc(fmt(r.date))}</h3><p style="white-space:pre-wrap">${esc(r.general||r.assessment?.complaint||'')}</p><p style="white-space:pre-wrap">${esc(r.conduct||'')}</p><p style="white-space:pre-wrap">${esc(r.goal||'')}</p></article>`).join('')||'<p>Sem registros clínicos.</p>'}<h3>Anexos</h3>${files.map(f=>`<p><a href="${esc(f.data)}" target="_blank" rel="noopener">${esc(f.name)}</a></p>`).join('')||'<p>Sem anexos.</p>'}<h3>Financeiro</h3><p>${invoices.length} fechamento(s) preservado(s). Consulte a aba Financeiro para conferir valores e pagamentos.</p>${btn('Voltar à lixeira','olhanOpenTrash()','back','secondary small')}`,null);
 };
 const oldPatientForm=window.patientForm;
 window.patientForm=function(pid){oldPatientForm(pid);if(pid&&activePatient(pid))document.querySelector('#form .modalfoot')?.prepend(button('Excluir paciente',()=>window.olhanDeleteRequest('patient',pid)));};
 const oldAppointmentForm=window.appointmentForm;
 window.appointmentForm=function(aid,preset){oldAppointmentForm(aid,preset);if(aid&&db.appointments.some(a=>a.id===aid))document.querySelector('#form .modalfoot')?.prepend(button('Excluir agendamento',()=>window.olhanDeleteRequest('appointment',aid)));};
 const oldDetail=window.detail;
 window.detail=function(){return `<div class="deletion-toolbar">${btn('Excluir paciente',`olhanDeleteRequest('patient','${esc(patientId)}')`,'close','secondary small')}</div>`+oldDetail();};
 for(const name of ['patients','agenda']){const original=window[name];window[name]=function(){return `<div class="deletion-toolbar">${btn('Lixeira','olhanOpenTrash()','folder','secondary small')}</div>`+original();};}
 // A retained clinical visit can still be consulted, but cannot start new care for an excluded patient.
 const oldRecordForm=window.recordForm;
 window.recordForm=function(pid,...args){if(pid&&!activePatient(pid))return toast('Restaure o cadastro na lixeira para registrar novos atendimentos.');return oldRecordForm(pid,...args);};
 const dialog=document.getElementById('modal');dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 render();
})();
