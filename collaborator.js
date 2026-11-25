(()=>{'use strict';let state=null,page='inicio',activePatient='',agendaMonth='',weekDate='',agendaView='week',recordType='Evolução',attachmentFolder='Todos';const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—',today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),patients=()=>state?.data.patients||[],records=()=>state?.data.records||[],appointments=()=>state?.data.appointments||[],care=()=>state?.data.care||{};const toast=m=>{const e=$('#toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3500)};
async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let d={};try{d=await r.json()}catch{}if(!r.ok){const err=Error(d.error||'Não foi possível concluir.');err.revisionConflict=d.code==='REVISION_CONFLICT';throw err;}return d}
async function load(){state=await api('/api/collaborator-data');$('#person').textContent=state.user.name;render()}
async function mutate(action,payload){
 const out=await api('/api/collaborator-data',{revision:state.revision,action,payload});state.revision=out.revision;
 try{await load();toast('Alterações salvas.')}catch{toast('Salvo. Atualize a página para conferir.');}
 return true;
}
const navItems=[['inicio','Início'],['pendencias','Pendências'],['agenda','Agenda'],['pacientes','Pacientes'],['prontuarios','Prontuários e avaliações'],['arquivos','Fotos, vídeos e documentos'],['relatorios','Relatórios'],['aniversarios','Aniversários'],['exercicios','Exercícios'],['assistente','Assistente Olhan'],['contrato','Contrato de colaboradora']];function shell(){ $('#nav').innerHTML=navItems.map(([k,n])=>`<button data-page="${k}" class="${page===k?'active':''}">${n}</button>`).join('');$('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()}) }
function patientOptions(){return patients().map(p=>`<option value="${esc(p.id)}" ${activePatient===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
function title(h,sub=''){return `<div class="eyebrow">Minha área</div><h1>${h}</h1><p class="muted">${sub}</p>`}
function home(){let upcoming=appointments().filter(a=>a.date>=today()&&a.status!=='Realizado').length,notes=records().length,files=(state.data.files||[]).length;return `${title('Olá, '+esc(state.user.name.split(' ')[0])+'.','Acompanhe sua agenda e os pacientes vinculados a você.') }<div class="cards"><section class="card"><div class="eyebrow">Pacientes atribuídos</div><div class="stat">${patients().length}</div><button data-go="pacientes" class="secondary">Abrir pacientes</button></section><section class="card"><div class="eyebrow">Próximos atendimentos</div><div class="stat">${upcoming}</div><button data-go="agenda" class="secondary">Ver agenda</button></section><section class="card"><div class="eyebrow">Registros clínicos</div><div class="stat">${notes}</div><button data-go="prontuarios" class="secondary">Ver prontuários</button></section><section class="card"><div class="eyebrow">Arquivos clínicos</div><div class="stat">${files}</div><button data-go="arquivos" class="secondary">Ver arquivos</button></section></div><section class="card"><h2>Próximos atendimentos</h2>${listAppointments(appointments().filter(a=>a.date>=today()).slice(0,5))}</section>`}
const {assessmentSections,painRegions,evolutionVitals}=OlhanClinicalFields;
const teamId=()=>state.data.team[0]?.id;
const shifted=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const weekStart=d=>shifted(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
const appointmentType=a=>a.service==='Avaliação inicial'?'Avaliação':'Evolução';
const ownVisit=a=>a?.pro===teamId();
const cancelled=a=>String(a?.status||'').includes('Cancelado');
const canRecord=a=>ownVisit(a)&&a.date<=today()&&!cancelled(a)&&!records().some(r=>r.appointment===a.id&&r.type===appointmentType(a)&&!r.draft);
function patientName(id){return patients().find(p=>p.id===id)?.name||'Paciente'}
function visitActions(a){
 return `<div class="actions">${canRecord(a)?`<button type="button" data-evolve="${esc(a.id)}">${appointmentType(a)==='Avaliação'?'Registrar avaliação':'Registrar evolução'}</button>`:''}<button type="button" class="secondary" data-update="${esc(a.id)}">Atualizar</button></div>`;
}
function listAppointments(list){
 return list.length?[...list].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(a=>`<div class="row"><div><strong>${esc(patientName(a.patient))}</strong><span class="sub">${fmt(a.date)} · ${esc(a.time||'')} · ${esc(a.service||'Fisioterapia')}</span></div><div><span class="pill">${esc(a.status)}</span>${visitActions(a)}</div></div>`).join(''):'<div class="empty">Nenhum atendimento neste período.</div>';
}
function agenda(){
 const start=weekStart(weekDate||today()),end=shifted(start,6),days=Array.from({length:7},(_,i)=>shifted(start,i));
 const items=appointments().filter(a=>a.date>=start&&a.date<=end),times=[...new Set(items.map(a=>a.time))].sort();
 return title('Agenda','Atendimentos dos pacientes atribuídos a você.')+
 `<div class="toolbar"><div class="actions"><button class="${agendaView==='week'?'':'secondary'}" data-agenda-view="week" aria-pressed="${agendaView==='week'}">Semana</button><button class="${agendaView==='list'?'':'secondary'}" data-agenda-view="list" aria-pressed="${agendaView==='list'}">Lista</button></div><button id="new-appt">Novo atendimento</button></div>`+
 (agendaView==='list'?`<div class="filters"><label>Mês<input id="month" type="month" value="${esc(agendaMonth)}"></label><button id="clear" class="secondary">Mostrar todos</button></div><section class="card">${listAppointments(appointments().filter(a=>!agendaMonth||a.date.slice(0,7)===agendaMonth))}</section>`:
 `<div class="toolbar week-controls"><div class="actions"><button class="secondary" data-week="-7" aria-label="Semana anterior">← Anterior</button><button class="secondary" data-week="today">Hoje</button><button class="secondary" data-week="7" aria-label="Próxima semana">Próxima →</button></div><label>Ir para a data<input id="week-date" type="date" value="${esc(weekDate||today())}"></label><strong>${fmt(start)} a ${fmt(end)}</strong></div><p class="sub week-hint">No celular, deslize para os lados para ver os outros dias.</p><div class="week-grid-wrap" tabindex="0" aria-label="Agenda semanal"><table class="week-grid"><thead><tr><th scope="col">Hora</th>${days.map((d,i)=>`<th scope="col" class="${d===today()?'current-day':''}">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]} · ${fmt(d).slice(0,5)}</th>`).join('')}</tr></thead><tbody>${times.map(t=>`<tr><th scope="row">${esc(t)}</th>${days.map(d=>`<td>${items.filter(a=>a.date===d&&a.time===t).map(a=>`<article class="week-visit"><strong>${esc(patientName(a.patient))}</strong><span class="sub">${esc(a.service||'Fisioterapia')} · ${esc(a.status)}</span>${visitActions(a)}</article>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>${times.length?'':'<div class="empty">Nenhum atendimento nesta semana.</div>'}</div>`);
}
const safeFileUrl=f=>{
 const v=String(f?.data||'');
 return /^\/api\/files\?id=[a-zA-Z0-9-]{1,100}$/.test(v)||/^data:(?:image\/(?:png|jpeg|webp|gif)|video\/(?:mp4|webm)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(v)?v:'';
};
function fileLink(f){
 const v=safeFileUrl(f);
 return v?`<a href="${esc(v)}" download="${esc(f.name||'Arquivo')}">${esc(f.name||'Arquivo')}</a>`:esc(f.name||'Arquivo');
}
function attachmentsPanel(p){
 const folders=state.data.fileFolders||['Geral','Registros de atendimento','Exames','Documentos'],all=(state.data.files||[]).filter(f=>f.patient===p.id);
 const filtered=all.filter(f=>attachmentFolder==='Todos'||(f.folder||'Geral')===attachmentFolder);
 return `<section class="card"><h2>Fotos, vídeos e documentos</h2><div class="toolbar"><label>Filtrar por pasta<select id="file-filter"><option>Todos</option>${folders.map(f=>`<option ${f===attachmentFolder?'selected':''}>${esc(f)}</option>`).join('')}</select></label><label>Pasta de destino<select id="upload-folder">${folders.map(f=>`<option ${f===attachmentFolder?'selected':''}>${esc(f)}</option>`).join('')}</select></label><label class="btn" for="upload">Adicionar arquivos</label><input id="upload" type="file" aria-label="Adicionar arquivos" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,application/pdf" multiple></div><p class="sub">PDF, imagens e vídeos MP4/WebM de até 50 MB por arquivo.</p><p id="upload-status" role="status"></p>${filtered.map(f=>`<div class="row"><div>${fileLink(f)}<div class="sub">${fmt(f.date)} · ${esc(f.folder||'Geral')}</div></div><span class="pill">${f.type?.startsWith('video/')?'Vídeo':f.type?.startsWith('image/')?'Foto':'Documento'}</span></div>`).join('')||'<div class="empty">Nenhum arquivo nesta pasta.</div>'}</section>`;
}
function summaryFields(r){
 const items=[...evolutionVitals.map(([k,label])=>[k,label]),['goal','Objetivos / orientações'],['conduct','Condutas / procedimentos']];
 return `<p class="record-text">${esc(r.general||'')}</p>${items.filter(([k])=>String(r[k]??'')!=='').map(([k,label])=>`<p><b>${label}:</b> ${esc(r[k])}</p>`).join('')}`;
}
function clinicalContent(r){
 if(!r.assessment)return summaryFields(r);
 const values=r.assessment;
 return assessmentSections.map(({title,fields})=>{
  const shown=fields.filter(([k])=>String(values[k]??'')!=='');if(!shown.length)return '';
  return `<details class="clinical-section"><summary>${esc(title)}</summary>${shown.map(([k,label])=>`<p class="record-text"><b>${esc(label)}:</b> ${esc(Array.isArray(values[k])?values[k].join(', '):values[k])}</p>`).join('')}</details>`;
 }).join('')+(values.painPoints?.length?`<p><b>Mapa da dor:</b> ${esc(values.painPoints.join(', '))}</p>`:'');
}
function clinicalRecord(r,withEdit=true){
 return `<article class="record"><div class="eyebrow">${esc(r.type)} · ${fmt(r.date)}${r.evaluationKind?' · '+esc(r.evaluationKind):''}</div><p class="sub">${r.pro===teamId()?'Registrado por você':'Registro da equipe'}${r.draft?' · Rascunho':''}${r.appointment?' · Vinculado ao atendimento':''}</p>${r.assessment?`<p class="record-text">${esc(r.assessment.complaint||'')}</p>`:''}${clinicalContent(r)}${r.attachments?.length?`<div><b>Anexos da avaliação</b><ul>${r.attachments.map(f=>`<li>${fileLink(f)}</li>`).join('')}</ul></div>`:''}${withEdit&&r.pro===teamId()?`<button class="secondary" data-edit-record="${esc(r.id)}">${r.draft?'Continuar avaliação':r.type==='Avaliação'?'Editar avaliação':'Editar evolução'}</button>`:''}${r.versions?.length?`<details class="clinical-section"><summary>Histórico de edições (${r.versions.length})</summary>${[...r.versions].reverse().map(v=>`<div class="record"><p class="sub">Versão anterior a ${esc(new Date(v.editedAt).toLocaleString('pt-BR'))}</p>${clinicalContent(v.snapshot||{})}</div>`).join('')}</details>`:''}</article>`;
}
function chart(){
 const p=patients().find(x=>x.id===activePatient)||patients()[0];if(!p)return title('Prontuários','Nenhum paciente atribuído a você.');
 activePatient=p.id;
 const rs=records().filter(r=>r.patient===p.id&&r.type===recordType).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.created||'').localeCompare(a.created||''));
 const visits=appointments().filter(a=>a.patient===p.id).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
 return title('Prontuário · '+esc(p.name),'Evoluções, avaliações, anexos e histórico do paciente.')+
 `<div class="toolbar"><label>Paciente<select id="patient-select">${patientOptions()}</select></label><div class="actions"><button id="new-record">Nova evolução</button><button id="new-evaluation" class="secondary">Nova avaliação</button></div></div><section class="card patient-summary"><div><h2>${esc(p.name)}</h2><p>${esc(p.status||'Ativo')} · ${esc(p.frequency||'Frequência não informada')}</p></div><div><b>Nascimento:</b> ${fmt(p.birth)}<br><b>Início do tratamento:</b> ${fmt(p.treatmentStartDate)}</div><div><b>Responsável:</b> ${esc(p.responsible||'—')}<br><b>Contato:</b> ${esc(p.phone||'—')}<br><b>Endereço:</b> ${esc(p.address||'—')}</div></section><div class="actions chart-tabs">${[['Evolução','Evoluções'],['Avaliação','Avaliações'],['files','Anexos'],['history','Histórico']].map(([k,l])=>`<button class="${recordType===k?'':'secondary'}" data-type="${k}" aria-pressed="${recordType===k}">${l}</button>`).join('')}</div>`+
 (recordType==='files'?attachmentsPanel(p):recordType==='history'?`<section class="card">${visits.map(a=>`<article class="record"><h3>${fmt(a.date)} · ${esc(a.time)} · ${esc(a.status)}</h3><p>${esc(a.service||'')}</p>${(a.history||[]).map(h=>`<p class="sub">${esc(h)}</p>`).join('')}</article>`).join('')||'<div class="empty">Nenhum atendimento no histórico.</div>'}</section>`:`<section class="card">${rs.map(clinicalRecord).join('')||'<div class="empty">Nenhum registro nesta seção.</div>'}</section>`);
}
function filesPage(){
 const p=patients().find(x=>x.id===activePatient)||patients()[0];if(!p)return title('Arquivos','Nenhum paciente atribuído a você.');
 activePatient=p.id;
 return title('Fotos, vídeos e documentos','Selecione um paciente para acessar seus arquivos.')+`<label>Paciente<select id="patient-select">${patientOptions()}</select></label>`+attachmentsPanel(p);
}
function patientsPage(){return `${title('Pacientes','A lista mostra apenas os cadastros atribuídos a você.') }<div class="cards">${patients().map(p=>`<article class="card"><div class="eyebrow">Paciente</div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.frequency||'')}${p.birth?' · '+fmt(p.birth):''}</p><p>${esc(p.responsible||'')}<br>${esc(p.phone||'')}</p><div class="actions"><button data-patient="${esc(p.id)}">Abrir prontuário</button><button class="secondary" data-files="${esc(p.id)}">Arquivos</button></div></article>`).join('')||'<div class="empty">Ainda não há pacientes atribuídos a você.</div>'}</div>`}
function reports(){return `${title('Relatórios e evoluções','Escolha paciente e registro para consultar o relatório clínico.') }<div class="filters"><select id="patient-select"><option value="">Selecione paciente</option>${patientOptions()}</select><select id="record-select"><option value="">Selecione atendimento / data</option>${records().filter(r=>!activePatient||r.patient===activePatient).map(r=>`<option value="${esc(r.id)}">${esc(patientName(r.patient))} · ${fmt(r.date)} · ${esc(r.type)}</option>`).join('')}</select></div><section class="card" id="report-result"><div class="empty">Selecione o paciente e depois um atendimento para abrir o relatório.</div></section>`}
function birthdays(){const now=new Date();let rows=patients().filter(p=>p.birth).sort((a,b)=>{const days=p=>{const d=new Date(p.birth+'T12:00:00');return (new Date(now.getFullYear(),d.getMonth(),d.getDate())-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/(86400000)};return days(a)-days(b)});return `${title('Aniversários','Datas dos pacientes sob seus cuidados.') }<section class="card">${rows.map(p=>`<div class="row"><strong>${esc(p.name)}</strong><span>${fmt(p.birth)}</span></div>`).join('')||'<div class="empty">Nenhuma data cadastrada.</div>'}</section>`}
function exercises(){let lib=care().exercises||[],as=care().assignments||[];return `${title('Exercícios','Biblioteca e exercícios vinculados aos pacientes atribuídos a você.') }<div class="toolbar"><button id="new-exercise">Cadastrar exercício</button><button class="secondary" id="assign-exercise">Vincular a paciente</button></div><div class="cards">${lib.map(e=>`<article class="card"><div class="eyebrow">${esc(e.category||'Exercício')}</div><h2>${esc(e.title)}</h2><p>${esc(e.instructions||'')}</p>${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">Abrir vídeo / material</a>`:''}<div class="sub">Vínculos ativos: ${as.filter(a=>a.exercise===e.id&&a.active!==false).length}</div></article>`).join('')||'<div class="empty">Nenhum exercício cadastrado.</div>'}</div>`}
function pendencias(){let list=appointments().filter(a=>a.status==='Remarcado'||(a.status==='Agendado'&&a.date<today()));return `${title('Pendências','Itens da agenda dos seus pacientes que merecem acompanhamento.') }<section class="card">${listAppointments(list)}</section>`}
function contract(){const cs=state.data.contracts||[];return `${title('Contrato de colaboradora','Acesso limitado ao seu contrato de prestação de serviço / colaboração.') }<section class="card">${cs.map(c=>`<article class="record"><h2>${esc(c.title||'Contrato de colaboradora')}</h2><p>${esc(c.status||'Rascunho')}</p><p>${esc(c.body||c.content||'')}</p></article>`).join('')||'<div class="empty">Seu contrato ainda não foi cadastrado pela administração.</div>'}</section>`}
function assistant(){return `${title('Assistente Olhan','Apoio de texto com as informações que você inserir nesta conversa.') }<section class="card"><p class="muted">Não inclua dados identificáveis que não sejam necessários para a orientação.</p><div id="chat" class="chat"></div><form id="chat-form" class="form"><label class="wide">Como posso ajudar?<textarea name="prompt" maxlength="4000" required placeholder="Escreva sua dúvida…"></textarea></label><button>Enviar</button></form></section>`}
function render(){shell();const f={inicio:home,agenda,pendencias, pacientes:patientsPage,prontuarios:chart,arquivos:filesPage,relatorios:reports,aniversarios:birthdays,exercicios:exercises,assistente:assistant,contrato:contract};$('#main').innerHTML=(f[page]||home)();wire()}
function wire(){document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{page=b.dataset.go;render()});document.querySelectorAll('[data-patient]').forEach(b=>b.onclick=()=>{activePatient=b.dataset.patient;recordType='Evolução';attachmentFolder='Todos';page='prontuarios';render()});document.querySelectorAll('[data-files]').forEach(b=>b.onclick=()=>{activePatient=b.dataset.files;attachmentFolder='Todos';page='arquivos';render()});document.querySelectorAll('[data-update]').forEach(b=>b.onclick=()=>editAppointment(b.dataset.update));document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{recordType=b.dataset.type;render()});document.querySelectorAll('[data-agenda-view]').forEach(b=>b.onclick=()=>{agendaView=b.dataset.agendaView;render()});document.querySelectorAll('[data-week]').forEach(b=>b.onclick=()=>{weekDate=b.dataset.week==='today'?today():shifted(weekDate||today(),Number(b.dataset.week));render()});$('#week-date')?.addEventListener('change',e=>{if(e.target.value){weekDate=e.target.value;render()}});
document.querySelectorAll('[data-evolve]').forEach(b=>b.onclick=()=>{const a=appointments().find(x=>x.id===b.dataset.evolve);if(canRecord(a))openVisitRecord(a)});
document.querySelectorAll('[data-edit-record]').forEach(b=>b.onclick=()=>{const r=records().find(x=>x.id===b.dataset.editRecord);if(r?.pro===teamId())newRecord({existing:r,type:r.type})});
$('#file-filter')?.addEventListener('change',e=>{attachmentFolder=e.target.value;render()});$('#new-evaluation')?.addEventListener('click',()=>newRecord({type:'Avaliação'}));
$('#month')?.addEventListener('change',e=>{agendaMonth=e.target.value;render()});$('#clear')?.addEventListener('click',()=>{agendaMonth='';render()});$('#patient-select')?.addEventListener('change',e=>{activePatient=e.target.value;attachmentFolder='Todos';render()});$('#record-select')?.addEventListener('change',e=>{let r=records().find(x=>x.id===$('#record-select').value);$('#report-result').innerHTML=r?clinicalRecord(r,false):'<div class="empty">Selecione um atendimento.</div>'});$('#new-appt')?.addEventListener('click',newAppt);$('#new-record')?.addEventListener('click',()=>newRecord());$('#new-exercise')?.addEventListener('click',newExercise);$('#assign-exercise')?.addEventListener('click',assignExercise);$('#upload')?.addEventListener('change',upload);$('#chat-form')?.addEventListener('submit',chat);}
const textarea=(key,label,value='',max=6000,required=false)=>`<label class="wide">${esc(label)}<textarea name="${key}" maxlength="${max}" ${required?'required':''}>${esc(value)}</textarea></label>`;
function inputField([key,label,type,choices,max],v){
 if(type==='area')return textarea(key,label,v);
 if(type==='multi')return `<fieldset class="wide"><legend>${esc(label)}</legend><div class="clinical-choices">${choices.map(choice=>`<label><input type="checkbox" name="${key}" value="${esc(choice)}" ${Array.isArray(v)&&v.includes(choice)?'checked':''}> ${esc(choice)}</label>`).join('')}</div></fieldset>`;
 if(type==='choice'||type==='pain'){
  const opts=type==='pain'?Array.from({length:11},(_,i)=>String(i)):choices;
  return `<label>${esc(label)}<select name="${key}"><option value="">Não informado</option>${opts.map(o=>`<option value="${esc(o)}" ${String(v??'')===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
 }
 return `<label>${esc(label)}<input name="${key}" value="${esc(v??'')}" ${type==='number'?`type="number" min="0" step="any" ${max!==undefined?'max="'+max+'"':''}`:'maxlength="6000"'}></label>`;
}
function assessmentForm(values={}){
 const pointFields=['Frente','Costas'].map(side=>`<details class="clinical-section wide"><summary>Mapa corporal · ${side}</summary><div class="clinical-choices">${painRegions.map(([,label])=>{const v=side+': '+label;return `<label><input type="checkbox" name="painPoints" value="${esc(v)}" ${values.painPoints?.includes(v)?'checked':''}> ${esc(label)}</label>`;}).join('')}</div></details>`).join('');
 return assessmentSections.map(({title,fields},i)=>`<details class="clinical-section wide" ${i===0?'open':''}><summary>${esc(title)}</summary><div class="form">${fields.map(f=>inputField(f,values[f[0]])).join('')}${i===assessmentSections.length-1?pointFields:''}</div></details>`).join('');
}
function modalForm(title,fields,submit,{label='Salvar',draft=false}={}){
 const box=document.createElement('section');box.className='card';
 box.innerHTML=`<div class="toolbar"><h2>${title}</h2><button class="secondary" type="button" data-form-close>Fechar</button></div><form class="form">${fields}<p class="wide form-message" role="alert"></p><div class="actions wide">${draft?'<button class="secondary" type="submit" value="draft">Salvar rascunho</button>':''}<button type="submit">${label}</button></div></form>`;
 $('#form-modal')?.remove();box.id='form-modal';$('#main').prepend(box);
 box.querySelector('[data-form-close]').onclick=()=>box.remove();const form=box.querySelector('form');let saving=false;
 form.onsubmit=async e=>{
  e.preventDefault();if(saving)return;saving=true;
  const controls=[...box.querySelectorAll('button')],message=box.querySelector('.form-message'),input=new FormData(form);
  controls.forEach(b=>b.disabled=true);message.textContent='Salvando…';
  try{await submit(input,e.submitter?.value==='draft');box.remove();}
  catch(err){message.textContent=err.message||'Não foi possível salvar. Tente novamente.';}
  finally{controls.forEach(b=>b.disabled=false);saving=false;}
 };
 box.scrollIntoView({behavior:'smooth',block:'start'});return form;
}
function editAppointment(id){
 const a=appointments().find(x=>x.id===id);if(!a)return;
 const shortcut=canRecord(a)?`<div class="actions wide"><button type="button" id="evolve-from-edit">${appointmentType(a)==='Avaliação'?'Registrar avaliação':'Registrar evolução'}</button></div>`:ownVisit(a)&&a.date>today()&&!cancelled(a)?'<p class="sub wide">O registro clínico pode ser feito a partir da data do atendimento.</p>':'';
 const form=modalForm('Atualizar atendimento',`<p class="wide"><b>${esc(patientName(a.patient))}</b></p><label>Data<input type="date" name="date" required></label><label>Horário<input type="time" name="time" required></label><label>Status<select name="status"><option>Agendado</option><option>Remarcado</option><option>Realizado</option><option>Cancelado sem cobrança</option></select></label>${textarea('notes','Observações',a.notes,1000)}${shortcut}`,d=>mutate('appointment.update',{id,...Object.fromEntries(d)}));
 form.elements.date.value=a.date;form.elements.time.value=a.time;form.elements.status.value=a.status;
 form.querySelector('#evolve-from-edit')?.addEventListener('click',()=>openVisitRecord(a));
}
function newAppt(){
 modalForm('Novo atendimento',`<label>Paciente<select name="patient" required>${patientOptions()}</select></label><label>Data<input type="date" name="date" required value="${weekDate||today()}"></label><label>Horário<input type="time" name="time" required value="09:00"></label><label>Duração (min)<input type="number" name="duration" value="60" min="15" max="240"></label><label>Serviço<select name="service"><option>Fisioterapia domiciliar</option><option>Avaliação inicial</option></select></label>${textarea('notes','Observações',undefined,1000)}`,d=>mutate('appointment.create',Object.fromEntries(d)));
}
function openVisitRecord(a){
 const type=appointmentType(a),draft=records().find(r=>r.appointment===a.id&&r.type===type&&r.draft&&r.pro===teamId());
 return newRecord({appointment:a,existing:draft||null,type});
}
function wireEvolutionAid(form){
 const box=form.querySelector('#evolution-helper'),status=box.querySelector('[role="status"]'),input=box.querySelector('input'),buttons=[...box.querySelectorAll('button')];
 let busy=false;
 const request=async useAudio=>{
  if(busy)return;
  const file=input.files[0],text=box.querySelector('textarea').value.trim();
  if(useAudio&&(!file||file.size>2621440)){status.textContent='Escolha um áudio de até 2,5 MB.';return}
  if(!useAudio&&!text){status.textContent='Escreva um relato para organizar.';return}
  busy=true;buttons.forEach(b=>b.disabled=true);status.textContent='Organizando relato…';
  try{
   const mimeType=file?.type||(file&&/\.m4a$/i.test(file.name)?'audio/mp4':'');
   const result=await api('/api/ai',useAudio?{mode:'evolution-audio',audioBase64:await fileAsBase64(file),mimeType}:{mode:'evolution',text});
   if(!form.isConnected)return;
   const fields=result.fields||{},filled=[];
   for(const key of ['general','goal','conduct',...evolutionVitals.map(([key])=>key)]){
    const el=form.elements[key],value=String(fields[key]??'').trim();if(!el||el.value.trim()||!value)continue;
    el.value=value;if(!el.value||!el.checkValidity()){el.value='';continue;}filled.push(key);
   }
   if(useAudio&&result.text)box.querySelector('textarea').value=result.text;
   status.textContent=(filled.length?filled.length+' campo(s) sugerido(s). Revise antes de salvar.':'Os campos já preenchidos foram preservados.')+(fields.warnings?.length?' '+fields.warnings.join(' '):'');
  }catch(e){status.textContent=e.message;}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
 };
 buttons[0].onclick=()=>request(false);buttons[1].onclick=()=>request(true);
}
const evolutionHelper=`<details id="evolution-helper" class="clinical-section wide"><summary>Organizar evolução com IA</summary><p class="sub">Envie apenas as informações necessárias. O relato ou áudio será processado pelo serviço de IA. Confira o resultado antes de salvar.</p><label>Relato<textarea maxlength="16000"></textarea></label><label>Áudio do atendimento<input type="file" accept="audio/*,.m4a"></label><div class="actions"><button type="button" class="secondary">Organizar texto</button><button type="button" class="secondary">Organizar áudio</button></div><p role="status" class="sub"></p></details>`;
function newRecord({appointment=null,existing=null,type='Evolução'}={}){
 if(!patients().length)return toast('Nenhum paciente atribuído a você.');
 if(appointment&&!canRecord(appointment))return;
 const isAssessment=type==='Avaliação',locked=!!(appointment||existing);
 const selected=existing?.patient||appointment?.patient||activePatient||patients()[0].id;
 const date=existing?.date||appointment?.date||today();
 const values=existing??{},linkedId=existing?.appointment||appointment?.id||'';
 const summary=`<div class="wide"><strong>${esc(patientName(selected))}</strong> · ${fmt(date)}${appointment?' · '+esc(appointment.time):''}</div>`;
 const target=locked?summary:`<label>Paciente<select name="patient" required>${patientOptions()}</select></label><label>Data<input type="date" name="date" required max="${today()}" value="${date}"></label><label class="wide">Atendimento relacionado<select name="appointment"></select></label>`;
 const clinical=isAssessment?`${existing?.evaluationKind?'':`<label>Tipo de avaliação<select name="evaluationKind"><option>Inicial</option><option>Reavaliação</option></select></label>`}${assessmentForm(values.assessment||{complaint:values.general,objective:values.goal,physioDiagnosis:values.conduct})}`:
 evolutionHelper+textarea('general','Evolução',values.general,12000,true)+
 `<details class="clinical-section wide"><summary>Campos complementares</summary><div class="form">${evolutionVitals.map(([k,l,,max])=>inputField([k,l,max===undefined?'text':'number',null,max],values[k])).join('')}${textarea('conduct','Condutas / procedimentos',values.conduct,6000)}${textarea('goal','Objetivos / orientações',values.goal,3000)}</div></details>`;
 const form=modalForm(existing?(isAssessment?'Editar avaliação':'Editar evolução'):(isAssessment?'Ficha de avaliação':'Registrar evolução'),target+clinical,async(data,draft)=>{
  const payload={...Object.fromEntries(data),patient:locked?selected:data.get('patient'),type,date:locked?date:data.get('date'),appointment:locked?linkedId:data.get('appointment')};
  if(existing)payload.id=existing.id;
  if(isAssessment){
   const keys=[...assessmentSections.flatMap(s=>s.fields.map(([k,,t])=>[k,t==='multi'])),['painPoints',true]];
   const info={};for(const [k,multi] of keys){const v=multi?data.getAll(k):data.get(k);if(v?.length)info[k]=v;delete payload[k];}
   payload.assessment=info;payload.draft=draft;
  }
  await mutate(existing?'record.update':'record.create',payload);
 },{label:isAssessment?(existing&&!existing.draft?'Salvar alterações':'Concluir avaliação'):'Salvar evolução',draft:isAssessment&&(!existing||existing.draft)});
 if(!isAssessment)wireEvolutionAid(form);
 if(!locked){
  form.elements.patient.value=selected;
  const syncDate=()=>{const a=appointments().find(a=>a.id===form.elements.appointment.value);form.elements.date.readOnly=!!a;if(a)form.elements.date.value=a.date;};
  const syncVisits=()=>{
   form.elements.appointment.innerHTML='<option value="">Registro avulso</option>'+appointments().filter(a=>a.patient===form.elements.patient.value&&ownVisit(a)&&a.date<=today()&&!cancelled(a)&&!records().some(r=>r.appointment===a.id&&r.type===type&&!r.draft)).map(a=>`<option value="${esc(a.id)}">${fmt(a.date)} · ${esc(a.time)} · ${esc(a.service||'')}</option>`).join('');
   syncDate();
  };
  form.elements.patient.onchange=syncVisits;form.elements.appointment.onchange=syncDate;syncVisits();
 }
}
function newExercise(){modalForm('Cadastrar exercício',`<label>Nome<input name="title" required maxlength="120"></label><label>Categoria<input name="category" maxlength="80"></label><label class="wide">Link HTTPS de vídeo / material<input name="url" type="url"></label><label class="wide">Orientações<textarea name="instructions" maxlength="3000"></textarea></label>`,d=>mutate('exercise.create',Object.fromEntries(d)))}
function assignExercise(){let lib=care().exercises||[];if(!lib.length)return toast('Cadastre um exercício primeiro.');modalForm('Vincular exercício',`<label>Paciente<select name="patient" required>${patientOptions()}</select></label><label>Exercício<select name="exercise">${lib.map(e=>`<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</select></label><label class="wide">Orientações personalizadas<textarea name="instructions"></textarea></label>`,d=>mutate('exercise.assign',Object.fromEntries(d)))}
const fileAsBase64=f=>new Promise((resolve,reject)=>{
 const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));r.readAsDataURL(f);
});
const fileType=/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|application\/pdf)$/;
let uploading=false,lastFailedUpload=null;
async function sendAttachment(f,patient,progress){
 const details={patient,name:f.name,type:f.type};
 if(f.size<=3*1024*1024)return api('/api/files',{...details,base64:await fileAsBase64(f)});
 const init=await api('/api/media-upload',{...details,action:'init',size:f.size});
 const base={patient,id:init.id};
 try{
  for(let i=0;i<init.chunks;i++){
   progress(`Enviando ${f.name} · ${Math.round(i/init.chunks*100)}%`);
   await api('/api/media-upload',{...base,action:'chunk',index:i,base64:await fileAsBase64(f.slice(i*init.chunkSize,(i+1)*init.chunkSize,'application/octet-stream'))});
   if(i%3===2||i===init.chunks-1)await api('/api/media-upload',{...base,action:'assemble',part:Math.floor(i/3)});
  }
  return await api('/api/media-upload',{...base,action:'finish'});
 }catch(e){await api('/api/media-upload',{...base,action:'abort'}).catch(()=>{});throw e;}
}
async function upload(e){
 const input=e.target,files=[...input.files],patient=activePatient,folder=$('#upload-folder')?.value||'Geral';
 if(!files.length||!patient)return;
 if(uploading){input.value='';return toast('Aguarde o envio em andamento.');}
 if(files.some(f=>!fileType.test(f.type)||f.size<1||f.size>50*1024*1024||f.name.length>240)){
  input.value='';return toast('Use PDF, imagens ou vídeos MP4/WebM de até 50 MB por arquivo.');
 }
 uploading=true;input.disabled=true;let saved=0;
 const progress=text=>{const el=$('#upload-status');if(el&&activePatient===patient)el.textContent=text;};
 try{
  for(const f of files){
   progress('Enviando '+f.name+'…');
   const key=JSON.stringify([patient,f.name,f.type,f.size,f.lastModified]);
   const file=lastFailedUpload?.key===key?lastFailedUpload.file:await sendAttachment(f,patient,progress);
   lastFailedUpload={key,file};
   try{await mutate('file.register',{file,patient,folder,date:today()});}
   catch(e){
    if(!e.revisionConflict)throw e;
    await load();await mutate('file.register',{file,patient,folder,date:today()});
   }
   lastFailedUpload=null;saved++;
  }
  if(activePatient===patient&&folder!=='Geral'&&attachmentFolder!=='Todos'){attachmentFolder=folder;render();}
  toast(saved===1?'Arquivo adicionado.':saved+' arquivos adicionados.');
 }catch(e){const msg=(saved?saved+' arquivo(s) salvo(s). ':'')+e.message;progress(msg);toast(msg);}
 finally{uploading=false;input.value='';input.disabled=false;}
}
async function chat(e){e.preventDefault();let text=new FormData(e.target).get('prompt');let box=$('#chat');box.innerHTML+=`<div class="bubble user">${esc(text)}</div>`;try{const out=await api('/api/ai',{mode:'assistant',text,context:{patients:patients().map(p=>p.name),appointments:appointments().filter(a=>a.patient===activePatient).map(a=>({date:a.date,service:a.service,status:a.status})),records:records().filter(r=>r.patient===activePatient).map(r=>({date:r.date,type:r.type,general:r.general}))}});box.innerHTML+=`<div class="bubble"><div>${esc(out.proposal?.message||out.text||'')}</div>${(out.proposal?.actions||[]).map(a=>`<div class="record"><b>Sugestão: ${esc(a.operation)} ${esc(a.entity)}</b><br>${esc((a.fields||[]).map(f=>f.key+': '+f.value).join(' · '))}</div>`).join('')}<small>As sugestões não são aplicadas automaticamente.</small></div>`}catch(err){toast(err.message)}e.target.reset();box.scrollTop=box.scrollHeight}
$('#logout').onclick=async()=>{try{await fetch('/api/auth/sign-out',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'})}finally{location.replace('/login.html')}};load().catch(e=>{document.querySelector('main').innerHTML=`<h1>Não foi possível abrir a área</h1><p>${esc(e.message)}</p><a href="/login.html">Entrar</a>`});})();
