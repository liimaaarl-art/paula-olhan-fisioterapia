/* Olhan V14: rotinas do cuidado. Extensão da V13, sem migração destrutiva. */
(() => {
  'use strict';
  const state = {pending:'Todos', exerciseSearch:'', followPatient:'', reportPatient:''};
  const action = (fn,...args) => esc(`${fn}(${args.map(v=>JSON.stringify(v)).join(',')})`);
  const button = (label,fn,args=[],kind='secondary small') => `<button type="button" class="btn ${kind}" onclick="${action(fn,...args)}">${esc(label)}</button>`;
  const finite = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const canceled = a => String(a.status||'').includes('Cancelado');
  const validDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v||'') && iso(new Date(v+'T12:00:00'))===v;
  const clock = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v||'');
  const minutes = v => Number(v.slice(0,2))*60+Number(v.slice(3));
  const active = pid => db.patients.some(p=>p.id===pid&&(p.status||'Ativo')==='Ativo');
  const completed = a => db.records.some(r=>r.appointment===a.id&&!r.draft);
  const locked = a => billed(a)||completed(a);
  const stamp = () => new Date().toISOString();
  function model(){
    const c=db.care||(db.care={});
    c.version=14;c.preferences=c.preferences||{};
    for(const k of ['exercises','assignments','goals','audit'])if(!Array.isArray(c[k]))c[k]=[];
    if(!c.plans||Array.isArray(c.plans))c.plans={};
    return c;
  }
  function mutate(fn,message){
    const before=JSON.stringify(db);
    try{fn();if(!save()){db=JSON.parse(before);return false}closeModal();render();if(message)toast(message);return true}
    catch(e){db=JSON.parse(before);toast(e.message||'Não foi possível concluir a alteração.');return false}
  }
  function audit(kind,ref){const c=model();c.audit.push({at:stamp(),kind,ref});c.audit=c.audit.slice(-200)}
  function safeUrl(value){
    if(!String(value||'').trim())return '';
    try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}
  }
  function gap(){return Math.max(0,Math.min(180,finite(model().preferences.travelMinutes)))}
  function conflicts(a,b,buffer=gap()){
    if(a.id===b.id||a.pro!==b.pro||a.date!==b.date||canceled(a)||canceled(b))return false;
    return minutes(a.time)<minutes(b.time)+finite(b.duration)+buffer && minutes(b.time)<minutes(a.time)+finite(a.duration)+buffer;
  }
  function findConflict(candidates,ignore=[]){
    const pool=db.appointments.filter(a=>!ignore.includes(a.id));
    for(let i=0;i<candidates.length;i++){
      const a=candidates[i];
      const hit=[...pool,...candidates.slice(0,i)].find(b=>conflicts(a,b));
      if(hit)return {appointment:a,other:hit};
    }
    return null;
  }
  function financialIssues(){
    const items=[],seen=new Set();
    for(const i of db.invoices){
      const total=(i.items||[]).reduce((n,a)=>n+finite(a.price),0);
      if(Math.abs(total-finite(i.total))>.01)items.push({text:'Total diferente da soma das sessões',id:i.id});
      for(const a of i.items||[]){if(seen.has(a.id))items.push({text:'Sessão aparece em mais de um fechamento',id:i.id});seen.add(a.id)}
    }
    return items;
  }
  function pendings(){
    const c=model(),rows=[];
    db.appointments.filter(a=>a.date<=today&&a.status==='Realizado'&&!completed(a)).forEach(a=>rows.push({kind:'Evoluções',title:patient(a.patient).name,sub:`${fmt(a.date)} · ${a.time} · evolução pendente`,fn:'recordForm',args:[a.patient,a.id]}));
    db.records.filter(r=>r.type==='Avaliação'&&r.draft&&active(r.patient)).forEach(r=>rows.push({kind:'Avaliações',title:patient(r.patient).name,sub:'Avaliação em rascunho',fn:'openEvaluation',args:[r.id]}));
    db.patients.filter(p=>(p.status||'Ativo')==='Ativo').forEach(p=>{const plan=c.plans[p.id];if(plan?.nextReview&&plan.nextReview<=add(today,7))rows.push({kind:'Reavaliações',title:p.name,sub:`Reavaliação ${plan.nextReview<today?'atrasada':'prevista'} · ${fmt(plan.nextReview)}`,fn:'careOpenFollow',args:[p.id]})});
    (db.contracts||[]).filter(c=>!c.signedAt&&c.status!=='Assinado'&&c.status!=='Cancelado').forEach(c=>rows.push({kind:'Contratos',title:c.clientName||c.patientName||'Contrato',sub:c.deliveryRecordedAt?'Enviado — assinatura pendente':'Rascunho / envio pendente',fn:'contractForm',args:[c.id]}));
    db.invoices.filter(i=>!i.paid&&i.due&&i.due<today).forEach(i=>rows.push({kind:'Cobranças',title:patient(i.patient).name,sub:`Vencido em ${fmt(i.due)} · ${money(i.total)}`,fn:'showInvoice',args:[i.id]}));
    db.appointments.filter(a=>a.date<=today&&charge(a)&&!billed(a)).forEach(a=>rows.push({kind:'A faturar',title:patient(a.patient).name,sub:`${fmt(a.date)} · ${money(a.price)} · sem fechamento`,fn:'careOpenBilling',args:[a.patient]}));
    return rows;
  }
  const categories=['Todos','Evoluções','Avaliações','Reavaliações','Contratos','Cobranças','A faturar'];
  window.careSetPending=function(kind){state.pending=kind;render()};
  window.careOpenBilling=function(pid){closeModal();go('finance');invoiceForm();const f=document.getElementById('form');if(f?.elements.patient){f.elements.patient.value=pid;f.elements.patient.dispatchEvent(new Event('change'))}};
  function pendingView(){
    const all=pendings(),rows=all.filter(r=>state.pending==='Todos'||r.kind===state.pending);
    return head('Pendências do cuidado','O que precisa de atenção, com acesso direto para resolver.')+`<div class="care-filter">${categories.map(k=>`<button type="button" class="${state.pending===k?'selected':''}" onclick="${action('careSetPending',k)}">${esc(k)} <span class="care-count">${k==='Todos'?all.length:all.filter(r=>r.kind===k).length}</span></button>`).join('')}</div><section class="card">${rows.length?rows.map(r=>`<div class="care-item"><div><span class="care-badge">${esc(r.kind)}</span><h3 style="margin:8px 0 0">${esc(r.title)}</h3><p>${esc(r.sub)}</p></div>${button('Resolver',r.fn,r.args)}</div>`).join(''):'<div class="care-empty">Nenhuma pendência nesta categoria.</div>'}</section>`;
  }
  function summary(){const p=pendings();return `<section class="care-section"><div class="care-actions"><h2>Seu próximo passo</h2>${button('Todas as pendências','go',['care-pending'])}</div><div class="care-summary">${['Evoluções','Reavaliações','Contratos','Cobranças'].map(k=>`<button type="button" onclick="careSetPending('${k}');go('care-pending')"><strong>${p.filter(x=>x.kind===k).length}</strong><small>${esc(k)}</small></button>`).join('')}</div></section>`}

  window.carePreferences=function(){modal('Intervalo entre atendimentos',`<p class="care-note">Reserva mínima entre sessões do mesmo profissional, para deslocamento. Não calcula trânsito ou distância automaticamente.</p>${field('travelMinutes','Intervalo mínimo (minutos)',gap(),'number','min="0" max="180" step="5" required')}`,d=>{const n=Number(d.travelMinutes);if(!Number.isInteger(n)||n<0||n>180)return toast('Informe um intervalo entre 0 e 180 minutos.');mutate(()=>{model().preferences.travelMinutes=n;audit('intervalo-agenda','preferences')},'Intervalo atualizado. Horários antigos foram preservados; conflitos aparecem na agenda.')})};
  window.careShowRoute=function(aid){const a=db.appointments.find(x=>x.id===aid),address=a&&patient(a.patient).address;if(!address)return toast('Cadastre o endereço do paciente.');const url='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address);window.open(url,'_blank','noopener,noreferrer')};
  function agendaTools(){
    const {start,end}=agendaRange(),as=db.appointments.filter(a=>a.date>=start&&a.date<=end&&(!proFilter||a.pro===proFilter)&&!canceled(a)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    const pairs=[];for(let i=0;i<as.length;i++)for(let j=i+1;j<as.length;j++)if(conflicts(as[i],as[j]))pairs.push([as[i],as[j]]);
    return `<section class="care-section card"><div class="cardhead"><div><h2>Agenda domiciliar</h2><p>Intervalo mínimo: ${gap()} min · ${pairs.length} conflito${pairs.length===1?'':'s'} no período</p></div>${button('Ajustar intervalo','carePreferences')}</div>${pairs.length?`<div class="care-note care-warning" role="status">Confira os horários: ${pairs.slice(0,5).map(([a,b])=>esc(`${fmt(a.date)}: ${patient(a.patient).name} / ${patient(b.patient).name}`)).join(' · ')}${pairs.length>5?' · outros conflitos no período':''}</div>`:''}<div class="care-body care-actions">${as.slice(0,12).map(a=>`<div class="care-actions"><span class="care-meta">${fmt(a.date)} ${esc(a.time)} · ${esc(patient(a.patient).name)}</span>${button('Rota','careShowRoute',[a.id])}${button('Repor / substituir','careReschedule',[a.id])}</div>`).join('')||'<p>Sem atendimentos neste período.</p>'}</div></section>`;
  }
  window.careReschedule=function(aid){
    const a=db.appointments.find(x=>x.id===aid);if(!a)return;
    if(locked(a))return toast('Atendimento fechado ou com registro clínico não pode ser alterado.');
    modal('Reposição ou substituição',`<p class="care-note">${esc(patient(a.patient).name)} · ${fmt(a.date)} às ${esc(a.time)}. ${canceled(a)?'A reposição cria outra sessão e mantém o cancelamento original.':'A alteração preserva o histórico desta sessão.'}</p><div class="formgrid">${field('date','Nova data',a.date,'date','required')}${field('time','Horário',a.time,'time','required')}${select('pro','Profissional',db.team.map(t=>[t.id,t.name]),a.pro)}${area('reason','Motivo da alteração','')}</div>`,d=>{
      if(!validDay(d.date)||!clock(d.time)||!db.team.some(t=>t.id===d.pro)||minutes(d.time)+finite(a.duration)>1440)return toast('Confira data, horário e profissional.');
      if(!d.reason.trim())return toast('Informe o motivo da alteração.');
      if(a.replacementId)return toast('Este cancelamento já tem uma reposição vinculada.');
      const candidate={...a,id:a.id,date:d.date,time:d.time,pro:d.pro,status:'Remarcado'};
      if(findConflict([candidate],[a.id]))return toast('Há conflito de horário ou do intervalo de deslocamento.');
      mutate(()=>{
        const entry=`${new Date().toLocaleString('pt-BR')}: ${a.date} ${a.time} / ${professional(a.pro)} → ${d.date} ${d.time} / ${professional(d.pro)}. Motivo: ${d.reason.trim()}`;
        if(canceled(a)){const next={...candidate,id:id(),seriesId:null,replacementOf:a.id,history:[entry]};delete next.replacementId;db.appointments.push(next);a.replacementId=next.id;a.history=[...(a.history||[]),'Reposição vinculada: '+next.id]}
        else{Object.assign(a,candidate,{history:[...(a.history||[]),entry]})}
        audit('reposicao-substituicao',aid);
      },'Agenda atualizada com histórico.');
    });
  };
  // A V8 referenciava o estado de arraste de outra closure. Mantém um estado compartilhado.
  window.draggedAppointmentId=null;
  window.startAppointmentDrag=function(aid,ev){const a=db.appointments.find(x=>x.id===aid);if(!a||locked(a)||canceled(a)){ev?.preventDefault();return toast('Atendimento fechado, cancelado ou com evolução não pode ser arrastado.')}window.draggedAppointmentId=aid;if(ev?.dataTransfer){ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',aid)}ev?.currentTarget?.classList.add('dragging')};
  window.endAppointmentDrag=function(ev){ev?.currentTarget?.classList.remove('dragging');window.draggedAppointmentId=null};
  window.dropAppointmentToDay=function(date,ev){const aid=window.draggedAppointmentId||ev?.dataTransfer?.getData('text/plain'),a=db.appointments.find(x=>x.id===aid);if(a)window.dropAppointment(date,a.time,ev)};
  window.dropAppointment=function(date,time,ev){
    ev?.preventDefault();const aid=window.draggedAppointmentId||ev?.dataTransfer?.getData('text/plain');window.draggedAppointmentId=null;
    const a=db.appointments.find(x=>x.id===aid);if(!a)return;
    if(locked(a)||canceled(a))return toast('Atendimento fechado, cancelado ou com evolução não pode ser movido.');
    if(!validDay(date)||!clock(time))return toast('Data ou horário inválido.');
    const next=db.appointments.filter(x=>a.seriesId&&x.seriesId===a.seriesId&&(x.date+x.time)>=(a.date+a.time)&&!canceled(x)&&!locked(x));
    const all=next.length>1&&confirm('Alterar também os próximos atendimentos desta sequência? OK: sequência futura. Cancelar: somente esta sessão.');
    const targets=all?next:[a],days=Math.round((new Date(date+'T12:00:00')-new Date(a.date+'T12:00:00'))/864e5),delta=minutes(time)-minutes(a.time);
    const moved=targets.map(x=>{const n=minutes(x.time)+delta;return {...x,date:add(x.date,days),time:String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}});
    if(moved.some(x=>!clock(x.time)||minutes(x.time)+finite(x.duration)>1440))return toast('A alteração ultrapassaria o limite do dia.');
    if(findConflict(moved,targets.map(x=>x.id)))return toast('Há conflito de horário ou de deslocamento. Nenhuma sessão foi alterada.');
    mutate(()=>{moved.forEach(m=>{const x=db.appointments.find(x=>x.id===m.id);const history=[...(x.history||[]),`${new Date().toLocaleString('pt-BR')}: ${x.date} ${x.time} → ${m.date} ${m.time}${all?' · sequência futura':''}`];Object.assign(x,{date:m.date,time:m.time,status:'Remarcado',history})});audit('arrastar-agenda',aid)},all?'Sequência futura atualizada.':'Atendimento movido.');
  };
  const priorAppointment=window.appointmentForm;
  window.appointmentForm=function(aid,preset){
    priorAppointment(aid,preset);
    const a=db.appointments.find(x=>x.id===aid),f=document.getElementById('form');
    if(a&&f)f.querySelector('.formbody')?.insertAdjacentHTML('beforeend',`<div class="care-actions care-section">${button('Abrir rota','careShowRoute',[aid])}${button('Repor / substituir','careReschedule',[aid])}</div>`);
  };

  function exerciseView(){
    const list=model().exercises.filter(e=>!e.archived&&(e.title+' '+(e.category||'')).toLocaleLowerCase().includes(state.exerciseSearch.toLocaleLowerCase()));
    return head('Biblioteca de exercícios','Materiais reutilizáveis com orientações individuais.',button('Novo exercício','careExerciseForm',[],''))+`<div class="toolbar"><label>Buscar exercício<input value="${esc(state.exerciseSearch)}" placeholder="Nome ou categoria" oninput="careSearchExercise(this.value)"></label><span class="tag">${list.length} materiais</span></div><div class="care-note">Cadastre uma vez e vincule aos pacientes. Os materiais ficam neste navegador; o portal online e o armazenamento privado ainda precisam de integração.</div><div id="care-exercises" class="care-grid">${exerciseCards(list)}</div>`;
  }
  function exerciseCards(list){return list.map(e=>`<article class="card"><span class="care-badge">${esc(e.category||'Geral')}</span><h3 style="margin-top:12px">${esc(e.title)}</h3><p>${esc(e.instructions||'Sem orientação geral.')}</p><p class="care-meta">${model().assignments.filter(a=>a.exercise===e.id&&a.active!==false).length} vínculo(s) ativo(s)</p><div class="care-actions">${button('Ver material','careMaterial',[e.id])}${button('Vincular','careAssign',[e.id])}${button('Editar','careExerciseForm',[e.id])}${button('Arquivar','careArchiveExercise',[e.id])}</div></article>`).join('')||'<div class="card care-empty">Nenhum exercício encontrado. Cadastre o primeiro material.</div>'}
  window.careSearchExercise=function(value){state.exerciseSearch=value;document.getElementById('care-exercises').innerHTML=exerciseCards(model().exercises.filter(e=>!e.archived&&(e.title+' '+(e.category||'')).toLocaleLowerCase().includes(value.toLocaleLowerCase())))};
  window.careExerciseForm=function(eid){
    const e=model().exercises.find(x=>x.id===eid)||{};
    modal(eid?'Editar exercício':'Novo exercício',`<div class="formgrid">${field('title','Nome do exercício',e.title,'text','required maxlength="160"')}${field('category','Categoria',e.category,'text','maxlength="100"')}${field('url','Link HTTPS do material (opcional)',e.url,'url')}${area('instructions','Orientação geral',e.instructions)}<label class="wide">Ou anexar vídeo/imagem local (até 3 MB)<input name="material" type="file" accept="video/mp4,video/webm,image/png,image/jpeg,image/webp"></label></div><p class="care-help">Use somente materiais que podem ser compartilhados. Links externos seguem as permissões do serviço de origem. A edição da orientação geral aparece em todos os vínculos; instruções individuais são preservadas.</p>`,async d=>{
      const f=document.getElementById('form').elements.material.files[0];
      if(!d.title.trim())return toast('Informe o nome do exercício.');
      if(d.url.trim()&&!safeUrl(d.url))return toast('Use um link HTTPS válido, sem credenciais.');
      if(f&&(f.size>3*1024*1024||!['video/mp4','video/webm','image/png','image/jpeg','image/webp'].includes(f.type)))return toast('Use vídeo MP4/WebM ou imagem PNG/JPG/WebP de até 3 MB.');
      let material=e.material||'',materialType=e.materialType||'';
      if(f){try{material=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f)});materialType=f.type}catch{return toast('Não foi possível ler o material.')}}
      if(!document.getElementById('modal').open)return;
      mutate(()=>{const target=model().exercises.find(x=>x.id===eid);const value={title:d.title.trim(),category:d.category.trim(),url:safeUrl(d.url),instructions:d.instructions.trim(),material,materialType,updated:stamp()};if(target)Object.assign(target,value);else model().exercises.push({...value,id:id(),created:stamp()});audit('exercicio',eid||'novo')},'Exercício salvo.');
    });
  };
  window.careMaterial=function(eid){const e=model().exercises.find(x=>x.id===eid);if(!e)return;const url=safeUrl(e.url);const validMaterial=/^data:(video\/(mp4|webm)|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(e.material||'');modal(esc(e.title),`<p style="white-space:pre-wrap">${esc(e.instructions||'')}</p>${validMaterial?(e.materialType?.startsWith('video/')?`<video controls preload="metadata" style="width:100%;max-height:360px" src="${esc(e.material)}"></video>`:`<img alt="${esc(e.title)}" style="max-width:100%;max-height:360px" src="${esc(e.material)}">`):''}${url?`<p style="margin-top:14px"><a class="care-link" target="_blank" rel="noopener noreferrer" href="${esc(url)}">Abrir material externo ↗</a></p>`:''}${!validMaterial&&!url?'<p class="care-note">Este exercício contém apenas orientações escritas.</p>':''}`,null)};
  window.careArchiveExercise=function(eid){if(!confirm('Arquivar este exercício e desativar seus vínculos? O histórico será preservado.'))return;mutate(()=>{const e=model().exercises.find(x=>x.id===eid);if(e)e.archived=true;model().assignments.filter(a=>a.exercise===eid).forEach(a=>{a.active=false;a.updated=stamp()});audit('arquivar-exercicio',eid)},'Exercício arquivado e vínculos desativados.')};
  window.careAssign=function(eid,pid){
    const e=model().exercises.find(x=>x.id===eid&&!x.archived);if(!e)return;
    const patients=db.patients.filter(p=>(p.status||'Ativo')==='Ativo');if(!patients.length)return toast('Cadastre um paciente ativo primeiro.');
    const previous=model().assignments.find(a=>a.exercise===eid&&a.patient===(pid||patients[0].id)&&a.active!==false)||{};
    modal('Vincular exercício',`<h3>${esc(e.title)}</h3><div class="formgrid">${select('patient','Paciente',patients.map(p=>[p.id,p.name]),pid||patients[0].id)}${field('until','Revisar orientações em (opcional)',previous.until,'date')}${area('instructions','Orientações individuais revisadas pela profissional',previous.instructions)}</div><p class="care-help">As orientações individuais complementam o material geral. O vínculo não envia mensagem nem libera acesso online.</p>`,d=>{if(!active(d.patient)||d.until&&!validDay(d.until))return toast('Confira paciente e data.');mutate(()=>{const old=model().assignments.find(a=>a.patient===d.patient&&a.exercise===eid&&a.active!==false);if(old)Object.assign(old,{instructions:d.instructions.trim(),until:d.until,updated:stamp()});else model().assignments.push({id:id(),exercise:eid,patient:d.patient,instructions:d.instructions.trim(),until:d.until,active:true,created:stamp()});audit('vincular-exercicio',d.patient)},'Exercício vinculado ao paciente.')});
  };
  window.careRevoke=function(aid){mutate(()=>{const a=model().assignments.find(x=>x.id===aid);if(a){a.active=false;a.updated=stamp()}audit('retirar-exercicio',aid)},'Vínculo retirado. Histórico preservado.')};

  window.careOpenFollow=function(pid){closeModal();state.followPatient=pid;go('care-follow')};
  window.careSelectFollow=function(pid){state.followPatient=pid;state.reportPatient='';render()};
  function followView(){
    const pid=state.followPatient||db.patients[0]?.id;if(!pid)return head('Acompanhamento','Cadastre um paciente para começar.');
    const p=patient(pid),c=model(),plan=c.plans[pid]||{},goals=c.goals.filter(g=>g.patient===pid),assignments=c.assignments.filter(a=>a.patient===pid&&a.active!==false),evals=db.records.filter(r=>r.patient===pid&&r.type==='Avaliação'&&!r.draft),last=evals.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
    return head('Acompanhamento','Metas, reavaliações e exercícios no mesmo lugar.',button('Relatório de evolução','careReport',[pid],''))+`<div class="toolbar"><label>Paciente<select onchange="careSelectFollow(this.value)">${db.patients.map(x=>`<option value="${esc(x.id)}" ${x.id===pid?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>${button('Plano e próxima revisão','carePlanForm',[pid])}${button('Abrir prontuário','openPatient',[pid])}</div><section class="card care-section"><div class="cardhead"><div><h2>${esc(p.name)}</h2><p>${plan.nextReview?'Próxima reavaliação: '+fmt(plan.nextReview):'Próxima reavaliação ainda não definida'}</p></div><span class="tag">${evals.length} avaliações concluídas</span></div><div class="care-body"><p style="white-space:pre-wrap">${esc(plan.summary||last?.assessment?.objective||'Defina o plano de acompanhamento com a profissional.')}</p>${plan.nextReview&&plan.nextReview<today?'<p class="care-note care-warning">A data de reavaliação passou. Confira o plano e atualize a próxima revisão.</p>':''}</div></section><section class="card care-section"><div class="cardhead"><h2>Metas individuais</h2>${button('Nova meta','careGoalForm',[pid])}</div>${goals.map(g=>`<div class="care-item"><div><h3 class="${g.done?'care-goal-done':''}">${esc(g.title)}</h3><p>${esc(g.description||'')}${g.targetDate?' · prazo: '+fmt(g.targetDate):''}</p><p class="care-meta">${g.done?'Concluída pela profissional em '+fmt((g.completedAt||'').slice(0,10)):'Em acompanhamento'}${g.result?' · '+esc(g.result):''}</p></div><div class="care-actions">${button(g.done?'Reabrir':'Registrar conclusão','careCompleteGoal',[g.id])}${button('Editar','careGoalForm',[pid,g.id])}</div></div>`).join('')||'<div class="care-empty">Nenhuma meta cadastrada.</div>'}</section><section class="card care-section"><div class="cardhead"><h2>Exercícios vinculados</h2>${button('Vincular exercício','careChooseExercise',[pid])}</div>${assignments.map(a=>{const e=c.exercises.find(e=>e.id===a.exercise);return e?`<div class="care-item"><div><h3>${esc(e.title)}</h3><p>${esc(a.instructions||e.instructions||'Sem orientação individual.')}</p>${a.until?`<p class="care-meta">Revisão das orientações: ${fmt(a.until)}</p>`:''}</div><div class="care-actions">${button('Ver material','careMaterial',[e.id])}${button('Editar vínculo','careAssign',[e.id,pid])}${button('Retirar','careRevoke',[a.id])}</div></div>`:''}).join('')||'<div class="care-empty">Nenhum exercício vinculado.</div>'}</section>`;
  }
  window.carePlanForm=function(pid){const p=model().plans[pid]||{};modal('Plano de acompanhamento',`<div class="formgrid">${field('nextReview','Próxima reavaliação (opcional)',p.nextReview,'date')}${area('summary','Plano e objetivos revisados pela profissional',p.summary)}</div>`,d=>{if(d.nextReview&&!validDay(d.nextReview))return toast('Informe uma data válida.');mutate(()=>{model().plans[pid]={summary:d.summary.trim(),nextReview:d.nextReview,updated:stamp()};audit('plano',pid)},'Plano de acompanhamento salvo.')})};
  window.careGoalForm=function(pid,gid){const g=model().goals.find(x=>x.id===gid)||{};modal(gid?'Editar meta':'Nova meta',`<div class="formgrid">${field('title','Meta funcional',g.title,'text','required maxlength="200"')}${field('targetDate','Prazo (opcional)',g.targetDate,'date')}${area('description','Como a profissional acompanhará a meta',g.description)}</div>`,d=>{if(!d.title.trim()||d.targetDate&&!validDay(d.targetDate))return toast('Confira a meta e o prazo.');mutate(()=>{const target=model().goals.find(x=>x.id===gid),value={title:d.title.trim(),description:d.description.trim(),targetDate:d.targetDate,updated:stamp()};if(target)Object.assign(target,value);else model().goals.push({...value,id:id(),patient:pid,done:false,created:stamp()});audit('meta',pid)},'Meta salva.')})};
  window.careCompleteGoal=function(gid){const g=model().goals.find(x=>x.id===gid);if(!g)return;if(g.done)return mutate(()=>{g.done=false;delete g.completedAt;audit('reabrir-meta',gid)},'Meta reaberta.');modal('Registrar conclusão da meta',`<h3>${esc(g.title)}</h3>${area('result','Resultado observado pela profissional','')}`,d=>{if(!d.result.trim())return toast('Registre o resultado observado.');mutate(()=>{g.done=true;g.result=d.result.trim();g.completedAt=stamp();audit('concluir-meta',gid)},'Conclusão registrada.')})};
  window.careChooseExercise=function(pid){const es=model().exercises.filter(e=>!e.archived);if(!es.length){go('care-exercises');return careExerciseForm()}modal('Escolher exercício',es.map(e=>`<div class="care-item"><h3>${esc(e.title)}</h3>${button('Escolher','careAssign',[e.id,pid])}</div>`).join(''),null)};

  function reportHtml(pid){
    const p=patient(pid),c=model(),plan=c.plans[pid]||{},rs=db.records.filter(r=>r.patient===pid&&r.type==='Avaliação'&&!r.draft).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.created||'').localeCompare(b.created||'')),first=rs[0],last=rs.at(-1),goals=c.goals.filter(g=>g.patient===pid),evolutions=db.records.filter(r=>r.patient===pid&&r.type!=='Avaliação'&&!r.draft).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const fields=[['Queixa','complaint'],['Objetivo','objective'],['Dor (EVA)','pain'],['Testes e escalas','tests'],['Atividades diárias','adls'],['Plano terapêutico','plan'],['Observações','observations']];
    const val=(r,k)=>r?.assessment?.[k]??(k==='complaint'?r?.general:k==='objective'?r?.goal:'');
    return `<article id="care-report" class="care-report"><header class="care-report-title"><img alt="Olhan" src="${esc(document.querySelector('.brand').src)}"><div><h1>Relatório de acompanhamento</h1><p>${esc(p.name)} · emitido em ${fmt(today)}</p><p class="care-meta">${esc(professional(p.pro))}${db.team.find(t=>t.id===p.pro)?.crefito?' · '+esc(db.team.find(t=>t.id===p.pro).crefito):''}</p></div></header><h2>Avaliação inicial e atual</h2>${first?`<div class="care-scroll"><table><thead><tr><th>Registro</th><th>Inicial · ${fmt(first.date)}</th><th>Atual · ${fmt(last.date)}</th></tr></thead><tbody>${fields.map(([l,k])=>`<tr><td><b>${esc(l)}</b></td><td>${esc(val(first,k)===undefined||val(first,k)===null||val(first,k)===''?'Não registrado':val(first,k))}</td><td>${esc(val(last,k)===undefined||val(last,k)===null||val(last,k)===''?'Não registrado':val(last,k))}</td></tr>`).join('')}</tbody></table></div>${first.id===last.id?'<p class="care-meta">Existe uma única avaliação concluída; ainda não há comparação entre datas.</p>':''}`:'<p>Nenhuma avaliação concluída disponível.</p>'}<h2>Histórico de avaliações</h2><p>${rs.map(r=>esc(fmt(r.date)+' · '+(r.evaluationKind||'Avaliação'))).join(' / ')||'Sem avaliações concluídas.'}</p><h2>Plano e metas</h2><p>${esc(plan.summary||'Plano complementar não preenchido.')}</p><p class="care-meta">${plan.nextReview?'Próxima reavaliação: '+fmt(plan.nextReview):'Próxima reavaliação não definida.'}</p>${goals.map(g=>`<section><h3>${esc(g.title)} · ${g.done?'Concluída':'Em acompanhamento'}</h3><p>${esc(g.description||'')}</p><p>${esc(g.result||'Resultado ainda não registrado.')}</p></section>`).join('')||'<p>Nenhuma meta individual registrada.</p>'}<h2>Evoluções registradas</h2>${evolutions.map(r=>`<section><h3>${fmt(r.date)} · ${esc(professional(r.pro))}</h3><p>${esc(r.general||r.conduct||'Registro sem texto principal.')}</p>${r.goal?`<p>Objetivos e orientações: ${esc(r.goal)}</p>`:''}</section>`).join('')||'<p>Nenhuma evolução registrada.</p>'}<footer class="care-note">Relatório organizado a partir dos registros da profissional, sem interpretação clínica automática. Revisar antes de compartilhar. Assinatura profissional: __________________________________</footer></article>`;
  }
  window.careReport=function(pid){closeModal();state.reportPatient=pid;state.followPatient=pid;go('care-report')};
  window.carePrint=function(){document.body.classList.add('care-printing');window.print()};
  window.addEventListener('afterprint',()=>document.body.classList.remove('care-printing'));
  function reportView(){const pid=state.reportPatient||state.followPatient||db.patients[0]?.id;if(!pid)return head('Relatório','Cadastre um paciente.');return `<div class="care-actions care-tools">${button('Voltar ao acompanhamento','careOpenFollow',[pid])}${button('Imprimir / salvar PDF','carePrint',[],'')}${button('Baixar resumo CSV','careExportProgress',[pid])}</div>${reportHtml(pid)}`}
  window.careExportProgress=function(pid){const rows=[['Paciente','Data','Tipo','Objetivo','Dor','Testes'],...db.records.filter(r=>r.patient===pid&&r.type==='Avaliação'&&!r.draft).sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(r=>[patient(pid).name,r.date,r.evaluationKind||'Avaliação',r.assessment?.objective||r.goal||'',r.assessment?.pain??'',r.assessment?.tests||''])];download('Olhan_acompanhamento.csv',csv(rows),'text/csv;charset=utf-8')};

  // Cadastro e cálculo passam a utilizar a mesma regra, sem inferir a decisão da cliente.
  window.teamForm=function(tid){
    const t=db.team.find(t=>t.id===tid)||{};
    modal(tid?'Editar profissional':'Novo profissional',`<div class="formgrid">${field('name','Nome completo',t.name,'text','required')}${field('cpf','CPF',t.cpf)}${field('rg','RG',t.rg)}${area('address','Endereço completo',t.address)}${field('crefito','Nº CREFITO',t.crefito)}${select('maritalStatus','Estado civil',['Solteira','Casada','União estável','Divorciada','Viúva','Outro'],t.maritalStatus||'Solteira')}${field('role','Profissão / função',t.role||'Fisioterapeuta')}${field('email','E-mail',t.email,'email')}${field('repasse','Porcentagem de repasse legada (%)',t.repasse??0,'number','min="0" max="100" step="0.01"')}${select('payMode','Regra usada no fechamento',[['manual','Não definida / manual'],['fixed','Valor fixo por atendimento'],['percent','Percentual da produção']],t.payMode||'manual')}${field('payValue','Valor fixo (R$) ou percentual (%)',t.payValue??0,'number','min="0" step="0.01" required')}</div><p class="care-note">O cálculo usa a regra de fechamento. O percentual legado é preservado e não altera a regra automaticamente.</p>`,d=>{
      const value=Number(d.payValue),repasse=Number(d.repasse);
      if(!d.name.trim()||!Number.isFinite(value)||value<0||d.payMode==='percent'&&value>100||!Number.isFinite(repasse)||repasse<0||repasse>100)return toast('Confira nome e valores; percentuais devem ficar entre 0 e 100%.');
      mutate(()=>{const target=db.team.find(t=>t.id===tid);const data={...d,name:d.name.trim(),payValue:value,repasse};if(target)Object.assign(target,data);else db.team.push({...data,id:id()});audit('regra-profissional',tid||'novo')},'Dados e regra de fechamento salvos.');
    });
  };
  window.team=function(){return head('Nossa equipe','Cadastro e regra de fechamento por profissional.',button('Novo profissional','teamForm',[],''))+`<div class="grid3">${db.team.map(t=>`<section class="card patient"><div class="patient-top"><span class="avatar">${esc(initials(t.name))}</span><div><h3>${esc(t.name)}</h3><p>${esc(t.role||'Fisioterapeuta')}</p></div></div><div class="patient-info"><span>CREFITO: ${esc(t.crefito||'Não informado')}</span><span>E-mail: ${esc(t.email||'Não informado')}</span><span>Regra: ${t.payMode==='fixed'?money(t.payValue)+' por atendimento':t.payMode==='percent'?finite(t.payValue)+'% da produção':'Não definida / manual'}</span><span>${db.patients.filter(p=>p.pro===t.id).length} pacientes vinculados</span></div>${button('Editar profissional','teamForm',[t.id])}</section>`).join('')}</div>`};
  window.registerTeamPayment=function(proId){
    const t=db.team.find(x=>x.id===proId);if(!t||!['fixed','percent'].includes(t.payMode))return toast('Defina a regra de pagamento da profissional.');
    const as=db.appointments.filter(a=>a.pro===proId&&a.status==='Realizado'&&a.date>=financeFrom&&a.date<=financeTo),paid=new Set(db.cashEntries.filter(e=>e.pro===proId).flatMap(e=>e.appointmentIds||[])),unpaid=as.filter(a=>!paid.has(a.id));
    if(!unpaid.length)return toast('Não há atendimentos sem pagamento registrado neste período.');
    if((db.invoices.length+db.cashEntries.length)>=(window.DEMO_LIMITS?.financialRecords??Infinity))return toast('Limite de registros financeiros da demonstração atingido.');
    const gross=unpaid.reduce((s,a)=>s+finite(a.price),0),amount=t.payMode==='fixed'?unpaid.length*finite(t.payValue):gross*finite(t.payValue)/100;
    const oldPayments=db.cashEntries.filter(e=>e.pro===proId&&!(e.appointmentIds||[]).length);
    modal('Registrar pagamento da equipe',`<h3>${esc(t.name)}</h3><p class="care-note">${unpaid.length} atendimentos ainda sem repasse vinculado · ${money(amount)}.</p>${oldPayments.length?'<p class="care-note care-warning">Existem pagamentos antigos sem vínculo com sessões. Confira o histórico antes de registrar; esses pagamentos não podem ser conciliados automaticamente.</p>':''}<div class="formgrid">${field('date','Data do pagamento',today,'date','required')}${field('amount','Valor pago (R$)',amount.toFixed(2),'number','min="0.01" step="0.01" required')}${field('description','Descrição',`Pagamento ${t.name} · ${fmt(financeFrom)} a ${fmt(financeTo)}`)}</div>`,d=>{if(!validDay(d.date)||!Number.isFinite(Number(d.amount))||Number(d.amount)<=0)return toast('Confira data e valor.');if(db.cashEntries.some(e=>(e.appointmentIds||[]).some(a=>unpaid.some(x=>x.id===a))))return toast('Parte dessas sessões já recebeu pagamento. Reabra o fechamento.');mutate(()=>{db.cashEntries.push({id:id(),type:'saida',category:'Pagamento equipe',date:d.date,amount:Number(d.amount),description:d.description,pro:proId,appointmentIds:unpaid.map(a=>a.id),from:financeFrom,to:financeTo});audit('repasse',proId)},'Pagamento registrado e vinculado às sessões.')});
  };
  function financeCheck(){const issues=financialIssues();return `<section class="care-section card"><div class="cardhead"><div><h2>Conferência dos fechamentos</h2><p>${issues.length?'Itens que precisam de revisão':'Totais e vínculos de sessões conferidos nos dados locais'}</p></div></div>${issues.map(i=>`<div class="care-item"><p>${esc(i.text)}</p>${button('Conferir','showInvoice',[i.id])}</div>`).join('')||'<div class="care-body"><p>Nenhuma divergência de soma ou sessão duplicada identificada.</p></div>'}<p class="care-note">A conferência usa os registros do aplicativo. Recebimentos bancários e pagamentos antigos sem vínculo continuam sujeitos à conferência manual.</p></section>`}
  window.careContractDelivery=function(cid){const c=db.contracts.find(x=>x.id===cid);if(!c)return;modal('Registrar envio do contrato',`<p>Registre o envio realizado fora do aplicativo. Esta ação não envia mensagens.</p><div class="formgrid">${field('date','Data do envio',today,'date','required')}${field('channel','Canal utilizado','','text','required maxlength="100"')}</div>`,d=>{if(!validDay(d.date)||!d.channel.trim())return toast('Confira a data e o canal.');mutate(()=>{c.deliveryRecordedAt=d.date;c.deliveryChannel=d.channel.trim();audit('envio-contrato',cid)},'Envio registrado.')})};
  function contractTracker(){return `<section class="card care-section"><div class="cardhead"><h2>Acompanhamento de documentos</h2></div>${(db.contracts||[]).map(c=>`<div class="care-item"><div><h3>${esc(c.clientName||c.patientName||'Contrato')}</h3><p>${c.signedAt?'Assinado em '+fmt(c.signedAt.slice(0,10)):'Assinatura pendente'}${c.deliveryRecordedAt?' · envio registrado em '+fmt(c.deliveryRecordedAt)+' via '+esc(c.deliveryChannel):' · envio não registrado'}</p></div><div class="care-actions">${button('Abrir','contractForm',[c.id])}${button('Registrar envio','careContractDelivery',[c.id])}${c.signedAt?button('PDF','printContractPDF',[c.id]):''}</div></div>`).join('')||'<div class="care-empty">Nenhum contrato cadastrado.</div>'}</section>`}

  const oldHome=window.home;window.home=function(){return oldHome()+summary()};
  const oldAgenda=window.agenda;window.agenda=function(){return oldAgenda()+agendaTools()};
  const oldFinance=window.finance;window.finance=function(){return oldFinance()+financeCheck()};
  const oldContracts=window.contracts;window.contracts=function(){return oldContracts()+contractTracker()};
  const oldDetail=window.detail;window.detail=function(){return oldDetail()+`<section class="care-actions care-patient-tools">${button('Metas e exercícios','careOpenFollow',[patientId])}${button('Relatório de evolução','careReport',[patientId])}</section>`};
  const oldSettings=window.settings;window.settings=function(){return oldSettings()+`<section class="card care-section"><div class="settingrow"><div><h3>Agenda domiciliar</h3><p>Intervalo mínimo entre sessões: ${gap()} minutos.</p></div>${button('Ajustar','carePreferences')}</div><div class="settingrow"><div><h3>Novos registros V14</h3><p>Metas, planos, biblioteca e vínculos são incluídos no backup JSON do aplicativo.</p></div>${button('Exportar backup','exportBackup')}</div></section>`};
  // Mantém a exportação HTML independente incluindo os novos recursos.
  window.downloadHtml=async function(){
    try{
      const sources=[['care.css','style'],['bi.css','style'],['care.js','script'],['bi.js','script']];
      const external=sources.filter(([path,type])=>document.querySelector(type==='style'?`link[href="${path}"]`:`script[src="${path}"]`));
      const contents=await Promise.all(external.map(async([path,type])=>{const r=await fetch(path);if(!r.ok)throw Error();return {path,type,text:await r.text()}}));
      const doc=document.documentElement.cloneNode(true);
      for(const {path,type,text} of contents){doc.querySelector(type==='style'?`link[href="${path}"]`:`script[src="${path}"]`)?.remove();const el=document.createElement(type);el.textContent=text;doc.querySelector(type==='style'?'head':'body').append(el)}
      download('Olhan_App_v15_BI.html','<!doctype html>\n'+doc.outerHTML,'text/html;charset=utf-8');
    }catch{toast('Não foi possível baixar a versão independente. Use o aplicativo online e exporte o backup JSON.')}
  };
  const newNavs=[['care-pending','Pendências','clock'],['care-exercises','Exercícios','heart'],['care-follow','Acompanhamento','chart']];
  for(const n of newNavs)if(!navs.some(x=>x[0]===n[0]))navs.splice(navs.length-1,0,n);
  const previousGo=window.go;window.go=function(v){previousGo(v);window.scrollTo(0,0)};
  const oldRender=window.render;
  window.render=function(){
    model();oldRender();
    if(!patientId){let html;if(view==='care-pending')html=pendingView();if(view==='care-exercises')html=exerciseView();if(view==='care-follow')html=followView();if(view==='care-report')html=reportView();if(html)document.getElementById('app').innerHTML=html+'<div class="foot">OLHAN · CUIDADO EM ACOMPANHAMENTO · V14</div>'}
    document.querySelectorAll('.foot').forEach(el=>el.textContent=el.textContent.replace(/V13/g,'V14'));
  };
  window.OlhanCare={model,pendings,conflicts,findConflict,financialIssues,safeUrl,reportHtml,gap,version:14};
  render();
})();
