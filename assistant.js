/* Olhan V16: assistente e ditado clínico com revisão humana. */
(() => {
  'use strict';
  const state={configured:null,busy:false,text:'',answer:'',proposal:null,review:null,before:''};
  const fieldNames={general:'Evolução',pa:'PA inicial',fc:'FC inicial',spo:'SpO₂ inicial',pain:'Dor inicial',paFinal:'PA final',fcFinal:'FC final',spoFinal:'SpO₂ final',painFinal:'Dor final',conduct:'Condutas',goal:'Objetivos e orientações'};
  let code='';try{code=sessionStorage.getItem('olhan-ai-access')||''}catch{}
  let recording=null,clinicalRequest=null,clinicalFields=null;
  const btn=(label,fn,kind='secondary')=>`<button type="button" class="btn ${kind}" onclick="${fn}">${label}</button>`;
  const alive=f=>f&&document.getElementById('form')===f&&document.getElementById('modal').open;
  async function status(){try{const r=await fetch('/api/ai',{cache:'no-store'});if(!r.ok)throw Error();const j=await r.json();state.configured=j.configured===true;}catch{state.configured=false;}if(view==='assistant'&&!patientId&&!state.busy)render();}
  async function request(body,signal){
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+code},body:JSON.stringify(body),signal});
    let j;try{j=await r.json()}catch{throw Error('O servidor não retornou uma resposta válida.');}if(!r.ok)throw Error(j.error||'Não foi possível acessar a IA.');return j;
  }
  window.olhanConnectAI=function(){modal('Conectar o assistente',`<p class="note">Use o código de acesso da IA definido para a Paula. A chave Groq é configurada somente no servidor.</p>${field('code','Código de acesso','','password','required autocomplete="off"')}<p class="note">O código fica somente nesta sessão do navegador. Não será incluído em backups.</p>`,d=>{code=d.code.trim();try{sessionStorage.setItem('olhan-ai-access',code)}catch{}closeModal();status();toast('Código guardado nesta sessão. A IA validará na próxima solicitação.')},'Conectar')};
  window.olhanDisconnectAI=function(){code='';try{sessionStorage.removeItem('olhan-ai-access')}catch{}state.proposal=null;state.review=null;render();};
  function context(){return {
    today,patients:db.patients.map(p=>({id:p.id,name:p.name,pro:p.pro,status:p.status,price:p.price})),
    professionals:db.team.map(t=>({id:t.id,name:t.name})),
    appointments:db.appointments.map(a=>({id:a.id,patient:a.patient,pro:a.pro,date:a.date,time:a.time,duration:a.duration,price:a.price,status:a.status,seriesId:a.seriesId,locked:billed(a)||db.records.some(r=>r.appointment===a.id&&!r.draft)})),
    goals:OlhanCare.model().goals.map(g=>({id:g.id,patient:g.patient,title:g.title})),
    exercises:OlhanCare.model().exercises.map(e=>({id:e.id,title:e.title,archived:e.archived})),
    assignments:OlhanCare.model().assignments.map(a=>({id:a.id,patient:a.patient,exercise:a.exercise})),
    contracts:db.contracts.map(c=>({id:c.id,clientName:c.clientName,status:c.status})),
    invoices:db.invoices.map(i=>({id:i.id,patient:i.patient,total:i.total,paid:i.paid})),
    cash:db.cashEntries.map(e=>({id:e.id,date:e.date,amount:e.amount,type:e.type,description:e.description}))
  };}
  window.olhanAskAI=async function(){
    if(state.busy)return;const input=document.getElementById('assistant-command');state.text=input?.value?.trim()||'';if(!state.text)return toast('Descreva o que deseja fazer.');
    if(!code)return olhanConnectAI();state.before=JSON.stringify(db);state.busy=true;state.proposal=null;state.review=null;state.answer='Analisando seu pedido…';render();
    try{const j=await request({mode:'assistant',text:state.text,context:context()});state.answer=j.proposal.message;state.proposal=j.proposal;
      if(j.proposal.actions?.length){if(JSON.stringify(db)!==state.before)throw Error('Os dados mudaram durante a análise. Envie o pedido novamente.');state.review=OlhanAssistantCore.prepare(db,j.proposal.actions,{today,id,limits:window.DEMO_LIMITS});}
    }catch(e){state.answer=e.message;state.review=null;}finally{state.busy=false;render();}
  };
  function pretty(key,value){if(['patient','pro','exercise'].includes(key))return key==='patient'?patient(value).name:key==='pro'?professional(value):OlhanCare.model().exercises.find(e=>e.id===value)?.title||value;return value;}
  window.olhanApplyAI=function(){
    if(!state.review)return;if(JSON.stringify(db)!==state.before){state.review=null;render();return toast('Os dados mudaram. Envie novamente o pedido para revisar.');}
    let review;try{review=OlhanAssistantCore.prepare(db,state.proposal.actions,{today,id,limits:window.DEMO_LIMITS})}catch(e){return toast(e.message)}
    state.review=null;
    if(review.schedule){state.answer='Escolha agora o alcance da alteração na agenda.';render();return scheduleRequest(review.schedule.aid,review.schedule.patch);}
    if(review.external.length){const a=review.external[0];state.answer='Formulário aberto para revisão.';render();
      if(a.entity==='navigate')return go(a.values.view);
      if(a.entity==='contract')return contractForm(a.id||undefined);
      if(a.entity==='invoice'){go('finance');return a.id?showInvoice(a.id):invoiceForm();}
      if(a.entity==='evolution'){recordForm(a.values.patient,a.values.appointment||undefined);const f=document.getElementById('form');for(const [k,v] of Object.entries(a.values))if(f?.elements[k]&&!f.elements[k].disabled)f.elements[k].value=v;return;}
    }
    const old=db;db=review.data;OlhanCare.model().audit.push({at:new Date().toISOString(),kind:'assistente-ia',ref:review.changes.map(x=>x.label).join(', ')});
    if(!save()){db=old;state.answer='Não foi possível salvar. Nenhuma alteração foi aplicada.';}else state.answer='Alterações salvas. Confira os cadastros e registros atualizados.';render();
  };
  window.olhanDiscardAI=function(){state.review=null;state.proposal=null;state.answer='Proposta descartada. Nenhum dado foi alterado.';render();};
  function assistantView(){return head('Assistente Olhan','Descreva o que deseja cadastrar ou modificar. Você revisa antes de salvar.')+`<section class="card v16-ai"><div class="v16-ai-heading"><div><h2>Como posso ajudar na sua rotina?</h2><p>${state.configured===true?'Groq configurada no servidor.':state.configured===false?'A IA aguarda configuração no servidor.':'Conferindo a conexão com a IA…'}</p></div>${btn(code?'Trocar código':'Conectar IA','olhanConnectAI()')}${code?btn('Desconectar','olhanDisconnectAI()'):''}</div><label>Seu pedido<textarea id="assistant-command" maxlength="4000" placeholder="Ex.: mudar o atendimento de Maria do dia 28/10 para 10h. Ou: cadastrar um exercício de mobilidade com estas orientações…" ${state.busy?'disabled':''}>${esc(state.text)}</textarea></label><div class="v16-scope">${btn(state.busy?'Analisando…':'Preparar alteração','olhanAskAI()','')}${btn('Recarregar conexão','olhanRefreshAI()')}</div><p class="note">Cadastros, agenda, equipe, metas, planos, exercícios, orientações e caixa. Para evolução, contratos e fechamentos, o assistente abre o formulário para revisão. Dados clínicos e contratos assinados permanecem protegidos.</p>${state.answer?`<p class="v16-answer" role="status">${esc(state.answer)}</p>`:''}${state.review?`<section class="v16-review"><h3>Revise a proposta</h3>${state.review.changes.map(change=>`<h4>${esc(change.label)} · ${esc(change.operation==='create'?'inclusão':change.operation==='update'?'alteração':'abrir para revisão')}</h4><dl>${Object.entries(change.fields).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(pretty(k,v))}</dd>`).join('')}</dl>`).join('')}<div class="v16-scope">${btn(state.review.schedule?'Escolher sessão ou recorrência':'Confirmar proposta','olhanApplyAI()','')}${btn('Descartar','olhanDiscardAI()')}</div></section>`:''}</section><section class="card v16-ai"><h2>Acesso rápido</h2><p>Você também pode abrir os formulários diretamente.</p><div class="v16-scope">${btn('Paciente','patientForm()')}${btn('Agendamento','appointmentForm()')}${btn('Profissional','teamForm()')}${btn('Contratos','go(\'contracts\')')}${btn('Financeiro','go(\'finance\')')}${btn('Exercícios','go(\'care-exercises\')')}</div></section>`;}
  window.olhanRefreshAI=status;

  function stopAudio(){
    if(recording){clearTimeout(recording.timer);if(recording.recorder.state!=='inactive')recording.recorder.stop();recording.stream.getTracks().forEach(t=>t.stop());recording=null;}
    clinicalRequest?.abort();clinicalRequest=null;
  }
  const oldClose=window.closeModal;window.closeModal=function(){stopAudio();return oldClose()};
  const oldModal=window.modal;window.modal=function(...args){stopAudio();return oldModal(...args)};
  document.getElementById('modal').addEventListener('close',stopAudio);
  document.getElementById('modal').addEventListener('cancel',stopAudio);
  function output(message){const o=document.getElementById('evolution-ai-status');if(o)o.textContent=message;}
  let audioBlob=null,audioUrl=null;
  function setAudio(blob,f){if(!alive(f))return;if(blob.size>2500000){audioBlob=null;return output('Áudio acima de 2,5 MB. Grave um trecho menor.');}audioBlob=blob;const player=f.querySelector('#evolution-audio-player');if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);player.src=audioUrl;player.hidden=false;output('Áudio pronto. Ouça e envie para organizar a evolução.');}
  window.olhanRecordAudio=async function(){
    const f=document.getElementById('form');if(recording){clearTimeout(recording.timer);recording.recorder.stop();recording.stream.getTracks().forEach(t=>t.stop());recording=null;const b=f.querySelector('#evolution-record');if(b)b.textContent='Gravar áudio';return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return output('Este navegador não permite gravação. Use Enviar arquivo de áudio.');
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(!alive(f)){stream.getTracks().forEach(t=>t.stop());return;}
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));const rec=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:64000}),chunks=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(alive(f)){setAudio(new Blob(chunks,{type:rec.mimeType||mime||'audio/webm'}),f);f.querySelector('#evolution-record').textContent='Gravar áudio';}};
      rec.start(1000);recording={recorder:rec,stream,timer:setTimeout(()=>{if(recording?.recorder===rec)olhanRecordAudio()},180000)};f.querySelector('#evolution-record').textContent='Parar gravação';output('Gravando… limite de 3 minutos.');
    }catch(e){output('Não foi possível usar o microfone. Autorize o acesso ou envie um arquivo de áudio.');}
  };
  window.olhanAudioFile=function(input){const file=input.files?.[0];if(!file)return;setAudio(file,document.getElementById('form'));input.value='';};
  const base64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível ler o áudio.'));reader.readAsDataURL(blob)});
  window.olhanEvolutionAI=async function(audio=false){
    const f=document.getElementById('form');if(!f?.elements.general)return;if(!code){output('Abra Assistente Olhan no menu e conecte a IA com o código de acesso. Seu texto está preservado.');return;}
    if(recording)return output('Pare a gravação antes de enviar.');if(audio&&!audioBlob)return output('Grave ou escolha um arquivo de áudio primeiro.');
    const raw=f.querySelector('#evolution-ai-draft').value.trim();if(!audio&&!raw)return output('Digite ou cole o relato para organizar.');
    clinicalRequest?.abort();const controller=new AbortController();clinicalRequest=controller;const buttons=[...f.querySelectorAll('[data-evolution-ai]')];buttons.forEach(b=>b.disabled=true);output(audio?'Transcrevendo e organizando o áudio…':'Organizando o relato…');
    try{const body=audio?{mode:'evolution-audio',audioBase64:await base64(audioBlob),mimeType:audioBlob.type||'audio/mp4'}:{mode:'evolution',text:raw};const j=await request(body,controller.signal);if(!alive(f))return;
      if(audio)f.querySelector('#evolution-ai-draft').value=j.text;clinicalFields=j.fields;
      f.querySelector('#evolution-ai-preview').innerHTML=`<h3>Confira antes de preencher</h3><p class="note">Campos com conteúdo manual começam desmarcados. Selecione um deles somente se quiser substituir o texto.</p>${Object.entries(fieldNames).filter(([k])=>j.fields[k]).map(([k,l])=>`<label class="v16-field-choice"><input type="checkbox" data-ai-field="${k}" ${String(f.elements[k]?.value||'').trim()?'':'checked'}><span><b>${l}</b><small>${esc(j.fields[k])}</small></span></label>`).join('')}${(j.fields.warnings||[]).map(w=>`<p class="v16-error">${esc(w)}</p>`).join('')}${btn('Preencher campos selecionados','olhanApplyEvolutionAI()','')}`;
      output('Sugestão pronta. Revise a transcrição, os valores e os campos antes de aplicar.');
    }catch(e){if(e.name!=='AbortError')output(e.message);}finally{if(alive(f))buttons.forEach(b=>b.disabled=false);if(clinicalRequest===controller)clinicalRequest=null;}
  };
  window.olhanApplyEvolutionAI=function(){const f=document.getElementById('form');if(!f||!clinicalFields)return;let count=0;for(const input of f.querySelectorAll('[data-ai-field]:checked')){const k=input.dataset.aiField,el=f.elements[k],v=clinicalFields[k];if(!el||!v)continue;if(['fc','fcFinal','spo','spoFinal','pain','painFinal'].includes(k)){const n=Number(String(v).replace(',','.')),max=k.startsWith('fc')?300:k.startsWith('spo')?100:10;if(!Number.isFinite(n)||n<0||n>max){output('Confira o valor de '+fieldNames[k]+'. Nenhum outro campo foi alterado nesta aplicação.');return;}}}
    for(const input of f.querySelectorAll('[data-ai-field]:checked')){const k=input.dataset.aiField,el=f.elements[k];if(el&&clinicalFields[k]){el.value=String(clinicalFields[k]).replace(['fc','fcFinal','spo','spoFinal','pain','painFinal'].includes(k)?',':'\u0000','.');count++;}}
    f.querySelector('details')?.setAttribute('open','');output(count+' campo(s) preenchido(s). Revise e use Salvar para registrar no prontuário.');};
  const oldRecord=window.recordForm;window.recordForm=function(pid,aid){oldRecord(pid,aid);const f=document.getElementById('form');if(!f?.elements.general)return;audioBlob=null;clinicalFields=null;if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}
    const main=f.elements.general.closest('label');main.insertAdjacentHTML('beforebegin',`<section class="wide v16-clinical-ai"><h3>Organizar evolução com IA</h3><p class="note">Grave ou envie um áudio, ou escreva o relato. Ao enviar, o conteúdo será processado pela Groq. Confira a sugestão antes de salvar.</p><label>Relato para organizar<textarea id="evolution-ai-draft" maxlength="16000" placeholder="Relate o atendimento e os sinais medidos, sem precisar separar os campos."></textarea></label><div class="v16-scope"><button type="button" class="btn secondary" id="evolution-record" onclick="olhanRecordAudio()">Gravar áudio</button><label class="btn secondary">Escolher áudio<input hidden type="file" accept="audio/*,.m4a" onchange="olhanAudioFile(this)"></label><button type="button" class="btn" data-evolution-ai onclick="olhanEvolutionAI(true)">Enviar áudio à IA</button><button type="button" class="btn secondary" data-evolution-ai onclick="olhanEvolutionAI(false)">Organizar texto</button></div><audio id="evolution-audio-player" controls hidden></audio><p class="note">Até 3 minutos de gravação ou 2,5 MB por arquivo. O áudio não é salvo no prontuário. A IA depende de configuração no servidor.</p><p id="evolution-ai-status" role="status" aria-live="polite"></p><div id="evolution-ai-preview"></div></section>`);
    f.querySelector('.v5-complementary .formgrid')?.insertAdjacentHTML('beforeend',`${field('paFinal','Pressão arterial final (mmHg)')}${field('fcFinal','Frequência cardíaca final (bpm)','','number','min="0" max="300"')}${field('spoFinal','SpO₂ final (%)','','number','min="0" max="100"')}${field('painFinal','Dor final (0 a 10)','','number','min="0" max="10"')}`);
  };
  const nav=['assistant','Assistente Olhan','heart'];if(!navs.some(x=>x[0]===nav[0]))navs.splice(1,0,nav);
  const oldHome=window.home;window.home=function(){return oldHome()+`<section class="card v16-ai"><div class="v16-ai-heading"><div><h2>Assistente Olhan</h2><p>Peça ajuda para cadastrar, organizar ou modificar informações.</p></div>${btn('Abrir assistente',"go('assistant')",'')}</div></section>`};
  const oldRender=window.render;window.render=function(){oldRender();if(view==='assistant'&&!patientId)document.getElementById('app').innerHTML=assistantView()+'<div class="foot">OLHAN · ASSISTENTE · V16</div>';document.querySelectorAll('.foot').forEach(e=>e.textContent=e.textContent.replace(/V1[345]/g,'V16'));};
  window.OlhanAI={context,status};render();status();
})();
