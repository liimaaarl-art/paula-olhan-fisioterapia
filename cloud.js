/* Server is authoritative. Legacy browser records are kept until explicit import. */
(() => {
 'use strict';
 const initial=window.__OLHAN_CLOUD__;if(!initial)return;
 let revision=initial.revision,ready=revision>0,pending=null,running=null,blocked=false,confirmed=JSON.stringify(db);
 const bar=document.createElement('div');bar.id='cloud-status';bar.setAttribute('role','status');
 bar.style.cssText='position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:10000;background:#173e39;color:white;padding:12px 18px;border-radius:12px;max-width:95vw;font:14px sans-serif;box-shadow:0 4px 24px #0004';document.body.append(bar);
 const label=document.createElement('span');bar.append(label);
 function status(text){label.textContent=text;}
 function download(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(db)],{type:'application/json'}));a.download='olhan-alteracoes-pendentes.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 const exportButton=document.createElement('button');exportButton.textContent='Exportar cópia';exportButton.style.cssText='margin-left:12px;color:inherit;background:transparent;border:1px solid white;border-radius:4px;padding:4px 8px;cursor:pointer';exportButton.onclick=download;bar.append(exportButton);
 async function api(url,body,method='POST'){
  const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();if(!r.ok){const e=Error(j.error||'O servidor não confirmou o salvamento.');e.status=r.status;throw e;}return j;
 }
 async function sendFile(file,patient,name,type){
  const encoded=typeof file==='string'?file:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  const parts=/^data:([^;,]+);base64,(.*)$/.exec(encoded);if(!parts)throw Error('Anexo local inválido: '+name);
  return api('/api/files',{patient,name,type:type||parts[1],base64:parts[2]});
 }
 async function migrateFiles(data){
  for(const file of data.files){if(!String(file.data||'').startsWith('data:'))continue;
   status('Enviando anexo ao servidor: '+file.name);
   const uploaded=await sendFile(file.data,file.patient,file.name,file.type);
   file.cloudId=uploaded.id;file.data=uploaded.data;file.type=uploaded.type;
  }return data;
 }
 async function drain(){
  try{while(pending!==null){const next=pending;pending=null;status('Salvando no servidor…');const data=JSON.parse(next);await migrateFiles(data);
   const result=await api('/api/workspace',{revision,data},'PUT');revision=result.revision;confirmed=JSON.stringify(data);savedSnapshot=confirmed;
   // Keep metadata converted during a legacy import, unless newer edits exist.
   if(pending===null){db=data;render();}status('Salvo no servidor · versão '+revision);
  }}catch(e){blocked=true;pending=JSON.stringify(db);status(e.message+' Exporte sua cópia antes de sair.');throw e;}
 }
 function persist(){
  if(!ready||blocked){toast('Salvamento bloqueado. Conclua a importação ou exporte suas alterações pendentes.');return false;}
  pending=JSON.stringify(db);if(!running){running=drain().catch(()=>{}).finally(()=>{running=null;});}return true;
 }
 window.OlhanCloud={save:persist,async flush(){if(!ready||blocked)throw Error('Dados ainda não disponíveis no servidor.');if(running)await running;if(blocked)throw Error('Há alterações sem confirmação do servidor.');},status:()=>({revision,ready,pending:!!running,blocked})};
 save=persist;
 const oldToast=toast;toast=function(message){if(running&&/salv|registrad|atualizad|criad|anexad|excluí|removid/i.test(message))return oldToast('Alteração em processamento. Confira a confirmação de salvamento no servidor.');return oldToast(message);};
 window.addEventListener('beforeunload',e=>{if(running||pending!==null){e.preventDefault();e.returnValue='';}});
 uploadFile=async function(el){const file=el.files?.[0];el.value='';if(!file)return;if(file.size>3145728)return toast('Limite de 3 MB por arquivo.');const pid=patientId,folder=typeof patientFileFolderFilter==='string'&&patientFileFolderFilter!=='Todos'?patientFileFolderFilter:'Geral';
  try{await OlhanCloud.flush();status('Enviando arquivo ao servidor…');const item=await sendFile(file,pid,file.name,file.type);db.files.push({...item,cloudId:item.id,patient:pid,folder,date:today});persist();await OlhanCloud.flush();render();}
  catch(e){status(e.message||'Não foi possível salvar o arquivo.');}
 };
 if(ready){status('Dados carregados do servidor · versão '+revision);return;}
 // Import must happen on the device containing the original records.
 const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:#f6f2ea;display:grid;place-items:center;padding:24px;overflow:auto';
 const panel=document.createElement('section');panel.style.cssText='max-width:600px;background:white;padding:32px;border-radius:16px;box-shadow:0 8px 40px #193c3820';overlay.append(panel);document.body.append(overlay);
 const title=document.createElement('h1');title.textContent='Seus dados, agora no servidor';panel.append(title);
 const copy=document.createElement('p');copy.textContent=initial.role==='admin'?(initial.hadLegacy?'Encontramos os dados deste navegador. Confira e importe a cópia original da Paula. Os dados antigos continuarão preservados neste aparelho.':'Abra este sistema no navegador que já contém os cadastros da Paula para importar os dados. Inicie vazio somente se ainda não houver cadastros.'): 'A Paula precisa abrir o sistema no navegador que contém seus cadastros e importar os dados. Depois, o suporte verá a mesma base.';panel.append(copy);
 const info=document.createElement('p');info.textContent=initial.hadLegacy?(db.patients?.length||0)+' pacientes · '+(db.appointments?.length||0)+' agendamentos · '+(db.files?.length||0)+' anexos neste navegador':'Sem cadastros locais para importar. Exemplos não serão enviados.';panel.append(info);
 if(initial.role!=='admin'){status('Aguardando importação pela administradora.');return;}
 const button=document.createElement('button');button.className='btn';button.textContent=initial.hadLegacy?'Importar estes dados para o servidor':'Iniciar uma base vazia';panel.append(button);
 button.onclick=async()=>{if(!confirm(initial.hadLegacy?'Importar os dados e anexos deste navegador para a base compartilhada da Olhan? A cópia antiga será preservada.':'Confirma iniciar uma base vazia? Se a Paula já tem dados em outro navegador, cancele e importe por ele.'))return;
  button.disabled=true;
  try{let data=JSON.parse(JSON.stringify(db));if(!initial.hadLegacy){for(const key of Object.keys(data))if(Array.isArray(data[key]))data[key]=[];}
   data=await migrateFiles(data);const result=await api('/api/workspace',{revision:0,data},'PUT');revision=result.revision;db=data;confirmed=JSON.stringify(data);savedSnapshot=confirmed;ready=true;overlay.remove();render();status('Importação concluída. Dados salvos no servidor.');
  }catch(e){status(e.message+' A cópia antiga continua preservada.');button.disabled=false;}
 };
 status('Aguardando confirmação da importação.');
})();
