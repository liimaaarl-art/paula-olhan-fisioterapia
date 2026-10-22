/* Modelos da equipe versionados no servidor, separados do contrato de paciente. */
(() => {
  'use strict';
  const teamContract=c=>c?.contractType==='team'||['team_ip','team_service'].includes(c?.templateKey);
  const kind=key=>key==='team_ip'?'Propriedade intelectual — Método Olhan':'Prestação de serviço — fisioterapeuta';
  const copy=o=>JSON.parse(JSON.stringify(o));
  let template=null;
  function fill(source,data,key){
    const v=(k,fallback)=>String(data[k]||fallback);
    let body=source;
    if(key==='team_ip'){
      const values={'[NOME COMPLETO]':v('clientName','[NOME COMPLETO]'),'[estado civil]':v('maritalStatus','[estado civil]'),'[profissão]':v('role','[profissão]'),'[órgão profissional, se aplicável]':'CREFITO','[endereço completo, com CEP]':v('clientAddress','[endereço completo, com CEP]')};
      for(const [from,to] of Object.entries(values))body=body.split(from).join(to);
      const ids=[v('clientCpf','[CPF]'),v('rg','[RG]'),v('crefito','[CREFITO]'),v('email','[E-MAIL]')];let i=0;body=body.replace(/\[\s*xxx\s*\]/gi,()=>ids[i++]||'[PREENCHER]');
    }else{
      body=body.replace('Nome, inscrita no CPF nº _ e CREFITO nº _.',`${v('clientName','[NOME]')}, inscrita no CPF nº ${v('clientCpf','[CPF]')} e CREFITO nº ${v('crefito','[CREFITO]')}.`);
      body=body.replace('eu, Nome, portador(a) do CPF nº _ e RG nº _, residente e domiciliado(a) em _,',`eu, ${v('clientName','[NOME]')}, portador(a) do CPF nº ${v('clientCpf','[CPF]')} e RG nº ${v('rg','[RG]')}, residente e domiciliado(a) em ${v('clientAddress','[ENDEREÇO]')},`);
      if(data.contractDate&&OlhanSchedule.day(data.contractDate))body=body.replace('Limeira, _____ de ____________ de _______.','Limeira, '+new Date(data.contractDate+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})+'.');
    }
    return body;
  }
  window.OlhanTeamContracts={fill,teamContract};
  async function templates(){const r=await fetch('/api/contracts',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'Modelos indisponíveis.');return j.templates;}
  function editor(c,isNew){
    if(c.status==='Assinado')return modal('Contrato assinado',`<p class="note">Documento bloqueado, versão ${esc(c.templateVersion)}.</p><div class="v16-contract-read">${esc(c.body)}</div>`,null);
    const source=c.templateSource||c.body;
    template={source,key:c.templateKey,generated:c.body};
    modal(isNew?'Novo contrato da equipe':'Editar contrato da equipe',`<div class="v16-contract-meta"><span>${esc(kind(c.templateKey))}</span><span>Modelo ${esc(c.templateVersion)} · ${esc(c.templateTitle||'')}</span></div><div class="formgrid">${select('professionalId','Profissional',db.team.map(t=>[t.id,t.name]),c.professionalId)}${field('clientName','Nome da profissional',c.clientName,'text','required')}${field('clientCpf','CPF',c.clientCpf,'text','required')}${field('rg','RG',c.rg,'text','required')}${field('crefito','CREFITO',c.crefito,'text','required')}${field('maritalStatus','Estado civil',c.maritalStatus)}${field('role','Profissão',c.role||'Fisioterapeuta')}${field('email','E-mail',c.email,'email')}${area('clientAddress','Endereço completo com CEP',c.clientAddress)}${field('contractDate','Data',c.contractDate||today,'date','required')}</div><div class="v16-scope"><button type="button" class="btn secondary" onclick="teamContractRebuild()">Preencher dados no modelo</button></div><label>Texto completo do contrato<textarea class="v16-contract-body" name="body" required>${esc(c.body)}</textarea></label><p class="note">A redação do documento enviado foi preservada. Revise os dados e os trechos a preencher antes de assinar. Este contrato não altera automaticamente a regra de remuneração cadastrada no Financeiro.</p>`,d=>{
      if(!d.body.trim()||!d.clientName.trim()||!d.clientCpf.trim()||!OlhanSchedule.day(d.contractDate))return toast('Confira nome, CPF, data e texto do contrato.');
      const before=JSON.stringify(db),current=db.contracts.find(x=>x.id===c.id);if(current?.status==='Assinado')return toast('O contrato já foi assinado e está bloqueado.');
      const value={...c,...d,body:d.body,contractType:'team',patient:null,patientName:'',patientCpf:'',sessionValue:0,updated:new Date().toISOString()};
      if(current)Object.assign(current,value);else db.contracts.push(value);
      if(!save()){db=JSON.parse(before);return;}closeModal();render();toast('Contrato da equipe salvo como rascunho.');
    },'Salvar rascunho');
    const f=document.getElementById('form');f.elements.professionalId.onchange=()=>{const p=db.team.find(t=>t.id===f.elements.professionalId.value);if(!p)return;for(const [key,from] of Object.entries({clientName:'name',clientCpf:'cpf',rg:'rg',crefito:'crefito',clientAddress:'address',maritalStatus:'maritalStatus',role:'role',email:'email'}))f.elements[key].value=p[from]||'';toast('Dados do cadastro carregados. Use Preencher dados no modelo para atualizar o texto.');};
  }
  window.teamContractRebuild=function(){const f=document.getElementById('form');if(!f?.elements.body||!template)return;if(f.elements.body.value!==template.generated&&!confirm('Substituir as edições do texto pelos dados atuais do modelo?'))return;const d=Object.fromEntries(new FormData(f));template.generated=fill(template.source,d,template.key);f.elements.body.value=template.generated;};
  const oldNew=window.newContractFromOnlineTemplateKey;
  window.newContractFromOnlineTemplateKey=async function(key){if(!['team_ip','team_service'].includes(key))return oldNew(key);try{
    const t=(await templates()).find(t=>t.template_key===key&&t.is_current);if(!t)return toast('Modelo vigente indisponível.');
    const member=db.team[0];if(!member)return toast('Cadastre uma profissional primeiro.');
    const c={id:id(),professionalId:member.id,clientName:member.name||'',clientCpf:member.cpf||'',rg:member.rg||'',crefito:member.crefito||'',clientAddress:member.address||'',maritalStatus:member.maritalStatus||'',role:member.role||'Fisioterapeuta',email:member.email||'',contractDate:today,status:'Rascunho',contractType:'team',templateKey:key,templateId:t.id,templateVersion:t.version,templateTitle:t.title,templateSource:t.content,created:new Date().toISOString(),providerSnapshot:copy(db.provider||OlhanShared.contractProviderDefaults)};
    c.body=fill(t.content,c,key);editor(c,true);
  }catch(e){toast(e.message)}};
  const oldForm=window.contractForm;window.contractForm=function(cid){const c=db.contracts.find(x=>x.id===cid);if(teamContract(c))return editor(copy(c),false);return oldForm(cid)};
  const oldDuplicate=window.duplicateContract;window.duplicateContract=function(cid){const c=db.contracts.find(x=>x.id===cid);if(!teamContract(c))return oldDuplicate(cid);const next={...copy(c),id:id(),status:'Rascunho',created:new Date().toISOString(),updated:new Date().toISOString(),previousContractId:c.id};for(const k of ['signedAt','clientSignature','providerSignature','deliveryRecordedAt','deliveryChannel'])delete next[k];editor(next,true)};
  const oldSign=window.signContract;window.signContract=function(cid){const c=db.contracts.find(x=>x.id===cid);if(!teamContract(c))return oldSign(cid);if(c.status==='Assinado')return toast('Este contrato já está assinado.');
    if(/\[(?:NOME|CPF|RG|CREFITO|E-MAIL|ENDEREÇO|PREENCHER|estado civil|profissão|endereço completo)/i.test(c.body)||c.body.includes('(definir política)'))return toast('Revise os dados e defina os trechos pendentes no texto antes de assinar.');
    const initial=c.body;modal('Assinar contrato da equipe',`<div class="v16-contract-read">${esc(c.body)}</div><label class="v16-check"><input type="checkbox" required><span>Conferimos o texto completo, os dados e a versão deste documento.</span></label><div class="signature-grid"><div class="signature-box"><h4>${c.templateKey==='team_ip'?'Profissional participante':'Contratada'} — ${esc(c.clientName)}</h4><canvas id="client-sign"></canvas><button type="button" class="textbtn" onclick="clearSignature('client-sign')">Limpar</button></div><div class="signature-box"><h4>${c.templateKey==='team_ip'?'Titular':'Contratante'} — ${esc(c.providerSnapshot?.name||db.provider.name)}</h4><canvas id="provider-sign"></canvas><button type="button" class="textbtn" onclick="clearSignature('provider-sign')">Limpar</button></div></div>`,()=>{
      if(c.status==='Assinado'||c.body!==initial)return toast('O documento mudou. Abra novamente para conferir.');const a=document.getElementById('client-sign'),b=document.getElementById('provider-sign');if(a.dataset.signed!=='1'||b.dataset.signed!=='1')return toast('As duas assinaturas são necessárias.');const before=JSON.stringify(db);Object.assign(c,{clientSignature:a.toDataURL('image/jpeg',.92),providerSignature:b.toDataURL('image/jpeg',.92),status:'Assinado',signedAt:new Date().toISOString(),updated:new Date().toISOString()});if(!save()){db=JSON.parse(before);return;}closeModal();render();toast('Contrato da equipe assinado e bloqueado.');
    },'Concluir assinatura');setTimeout(()=>{OlhanShared.bindSignatureCanvas(document.getElementById('client-sign'));OlhanShared.bindSignatureCanvas(document.getElementById('provider-sign'))},40);
  };
  window.openOnlineTemplates=async function(){try{const all=await templates();modal('Modelos online',`<p class="note">Cada contrato novo guarda uma cópia da versão escolhida. Contratos anteriores preservam seu conteúdo.</p>${all.filter(t=>t.is_current).map(t=>`<section class="record"><h3>${esc(t.title)}</h3><p>Versão ${esc(t.version)} · ${t.content.length.toLocaleString('pt-BR')} caracteres</p><button type="button" class="btn secondary" onclick="closeModal();newContractFromOnlineTemplateKey('${esc(t.template_key)}')">Usar modelo</button></section>`).join('')}`,null)}catch(e){toast(e.message)}};
  const oldContracts=window.contracts;window.contracts=function(){
    const all=db.contracts;let html;try{db.contracts=all.filter(c=>!teamContract(c));html=oldContracts()}finally{db.contracts=all;}
    return html+`<section class="card v16-ai"><h2>Contratos da equipe</h2><p>Modelos completos de prestação de serviço e propriedade intelectual do Método Olhan.</p><div class="v16-scope"><button type="button" class="btn" onclick="newContractFromOnlineTemplateKey('team_service')">Prestação de serviço</button><button type="button" class="btn secondary" onclick="newContractFromOnlineTemplateKey('team_ip')">Método Olhan</button></div>${all.filter(teamContract).map(c=>`<article class="record"><h3>${esc(c.clientName)}</h3><p>${esc(kind(c.templateKey))} · modelo ${esc(c.templateVersion)} · ${esc(c.status)}</p><div class="v16-scope"><button type="button" class="btn secondary" onclick="contractForm('${esc(c.id)}')">${c.status==='Assinado'?'Ver documento':'Editar'}</button>${c.status==='Assinado'?`<button type="button" class="btn" onclick="printContractPDF('${esc(c.id)}')">Baixar PDF</button><button type="button" class="btn secondary" onclick="duplicateContract('${esc(c.id)}')">Nova versão</button>`:`<button type="button" class="btn" onclick="signContract('${esc(c.id)}')">Assinar</button>`}<button type="button" class="btn secondary" onclick="careContractDelivery('${esc(c.id)}')">Registrar envio</button></div></article>`).join('')||'<p class="note">Nenhum contrato da equipe emitido neste navegador.</p>'}</section>`;
  };
  render();
})();
