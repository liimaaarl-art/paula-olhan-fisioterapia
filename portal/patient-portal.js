(() => {
'use strict';
const content=document.getElementById('content'),status=document.getElementById('status');
const demo=document.body.dataset.patientDemo==='true',preview=demo?window.OlhanPatientDemo:null;
const token=new URLSearchParams(location.hash.slice(1)).get('ativar');
if(token)history.replaceState(null,'',location.pathname);
let data=null,workspace=null,current={page:'home'},epoch=0,activeVideo=null;
const searches={};
const node=(tag,text='',cls='')=>{const e=document.createElement(tag);if(text!==''&&text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;};
const say=text=>{status.textContent=text||'';};
const paths={
 home:['M3 10 12 3l9 7','M5 9v12h14V9','M9 21v-7h6v7'],
 video:['M3 5h13v14H3z','m16 10 5-3v10l-5-3','m8 9 4 3-4 3z'],
 photo:['M3 4h18v16H3z','m3 16 6-6 5 5 3-3 4 4','M16 8h.01'],
 document:['M6 3h8l4 4v14H6z','M14 3v5h5','M9 12h6','M9 16h6'],
 visits:['M6 4h12v17H6z','M9 3h6v3H9z','M9 11h6','M9 15h4'],
 calendar:['M3 5h18v16H3z','M7 3v4','M17 3v4','M3 10h18','M7 14h3','M14 14h3'],
 arrow:['M5 12h14','m14 7 5 5-5 5'],
 back:['M19 12H5','m10 7-5 5 5 5'],
 chevron:['m9 5 7 7-7 7'],
 lock:['M5 10h14v11H5z','M8 10V7a4 4 0 0 1 8 0v3','M12 14v3'],
 logout:['M10 4H4v16h6','M9 12h12','m17 8 4 4-4 4'],
 search:['M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0','m15 15 6 6'],
 account:['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0','M4 21v-2a8 8 0 0 1 16 0v2']
};
function icon(kind){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');for(const d of paths[kind]||paths.document){const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',d);s.append(p);}return s;}
function button(label,action,cls='action',kind=''){const b=node('button','',cls);b.type='button';if(kind)b.append(icon(kind));b.append(node('span',label));b.onclick=action;return b;}
function stopMedia(){if(activeVideo){try{activeVideo.pause();activeVideo.removeAttribute('src');activeVideo.load();}catch{}activeVideo=null;}}
function authState(){stopMedia();epoch++;data=null;workspace=null;document.body.dataset.portalState='auth';const intro=document.getElementById('intro');if(intro)intro.hidden=false;const help=document.querySelector('.help');if(help)help.hidden=false;}
async function api(body,query=''){
 if(demo){if(!preview)throw Error('Demonstração indisponível. Atualize a página.');return preview.request(body,query);}
 const r=await fetch('/api/patient'+query,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let result;try{result=await r.json();}catch{throw Error('Serviço indisponível. Tente novamente.');}
 if(!r.ok){const error=Error(result.error||'Não foi possível continuar.');error.status=r.status;throw error;}return result;
}
function handleError(error){if(error.status===401)login('Sua sessão terminou. Entre novamente.');else say(error.message);}
function input(form,label,name,type='text',auto=''){const l=node('label'),i=document.createElement('input');l.append(node('span',label));i.name=name;i.type=type;i.required=true;i.autocomplete=auto;if(name==='cpf'){i.inputMode='numeric';i.maxLength=14;}if(type==='password'){i.maxLength=128;if(auto==='new-password')i.minLength=12;}l.append(i);form.append(l);return i;}
function form(title,submit){authState();content.replaceChildren();const f=node('form','','auth-form');f.append(node('h2',title));f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button[type="submit"]');b.disabled=true;say('Aguarde…');try{await submit(Object.fromEntries(new FormData(f)));}catch(error){say(error.message);}finally{b.disabled=false;}});content.append(f);return f;}
function submitButton(f,text){const b=node('button',text,'action full');b.type='submit';f.append(b);}
function login(message=''){const f=form('Entrar na área do paciente',async d=>{await api({action:'login',cpf:d.cpf,password:d.password});await home();});say(message);const user=input(f,demo?'Usuário de demonstração':'CPF do paciente (somente números)','cpf','text','username');const password=input(f,'Senha','password','password','current-password');if(demo){user.inputMode='text';user.value='admin';password.value='olhan';}submitButton(f,demo?'Entrar na demonstração':'Entrar');f.append(node('p',demo?'Acesso de demonstração: admin · olhan.':'No primeiro acesso, use o link enviado pela equipe para criar sua senha.','hint'));}
function activate(){const f=form('Criar ou redefinir senha',async d=>{if(d.password!==d.repeat)throw Error('As senhas precisam ser iguais.');await api({action:'activate',token,cpf:d.cpf,birth:d.birth,password:d.password});login('Senha salva. Entre com CPF e sua nova senha.');});say('Use o link em até 48 horas. Ele só pode ser usado uma vez.');input(f,'CPF do paciente','cpf','text','username');input(f,'Data de nascimento do paciente','birth','date','bday');input(f,'Nova senha (mínimo de 12 caracteres)','password','password','new-password');input(f,'Repita a senha','repeat','password','new-password');submitButton(f,'Salvar senha');}
function changePassword(){
 if(demo){say('A troca de senha está disponível no acesso real do paciente.');return;}
 const previous=data;
 const f=form('Trocar senha',async d=>{if(d.password!==d.repeat)throw Error('As senhas precisam ser iguais.');await api({action:'change-password',currentPassword:d.current,newPassword:d.password});login('Senha alterada. Entre novamente.');});say('');
 input(f,'Senha atual','current','password','current-password');input(f,'Nova senha (mínimo de 12 caracteres)','password','password','new-password');input(f,'Repita a nova senha','repeat','password','new-password');submitButton(f,'Salvar nova senha');f.append(button('Voltar à minha área',()=>enter(previous),'action secondary full'));
}
const plural=(n,one,many)=>n+' '+(n===1?one:many);
const dayKey=value=>{const s=String(value||'');if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);return m?m[3]+'-'+m[2]+'-'+m[1]:'undated';};
const dayLabel=(value,long=true)=>{const key=dayKey(value);if(key==='undated')return 'Sem data informada';const d=new Date(key+'T12:00:00');return Number.isNaN(d.getTime())?'Sem data informada':new Intl.DateTimeFormat('pt-BR',long?{dateStyle:'long'}:{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);};
const textKey=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const kinds={videos:{title:'Vídeos',icon:'video',one:'vídeo',many:'vídeos'},photos:{title:'Fotos',icon:'photo',one:'foto',many:'fotos'},documents:{title:'Documentos',icon:'document',one:'documento',many:'documentos'}};
function filesFor(kind){return data.media.filter(f=>kind==='videos'?f.type.startsWith('video/'):kind==='photos'?f.type.startsWith('image/'):f.type==='application/pdf').slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||a.name.localeCompare(b.name,'pt-BR'));}
function days(documentsOnly=false){const result=new Map();const get=key=>{if(!result.has(key))result.set(key,{key,records:[],files:[]});return result.get(key);};if(!documentsOnly)data.records.forEach((r,index)=>get(dayKey(r.date)).records.push(index));for(const f of filesFor('documents'))get(dayKey(f.date)).files.push(f);return [...result.values()].sort((a,b)=>a.key==='undated'?1:b.key==='undated'?-1:b.key.localeCompare(a.key));}
function upcoming(){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());return data.appointments.filter(a=>dayKey(a.date)!=='undated'&&dayKey(a.date)>=today&&!/realizado|cancelado/i.test(a.status||'')).slice().sort((a,b)=>(dayKey(a.date)+(a.time||'')).localeCompare(dayKey(b.date)+(b.time||'')));}
function navPage(v){if(v.section)return v.section;if(v.parent)return navPage(v.parent);return v.page;}
function go(view){stopMedia();current=view;render();}
function header(title,description='',parent=null){if(parent)workspace.append(button('Voltar',()=>go(parent),'back-button','back'));const h=node('div','','page-heading');h.append(node('p','Minha área','eyebrow'),node('h1',title));if(description)h.append(node('p',description,'page-description'));workspace.append(h);}
function empty(message){const e=node('div','','empty-state');e.append(icon('document'),node('p',message));return e;}
function selection(title,meta,kind,action,attributes={}){const b=button('',action,'selection-row');b.replaceChildren();const visual=node('span','','row-icon');visual.append(icon(kind));const words=node('span','','row-copy');words.append(node('span',title,'row-title'));if(meta)words.append(node('span',meta,'row-meta'));b.append(visual,words,icon('chevron'));for(const [k,v]of Object.entries(attributes))b.setAttribute(k,v);return b;}
function enter(value){
 data={name:String(value.name||'Paciente'),media:(value.media||[]).map(f=>({...f,name:String(f.name||'Arquivo')})),records:value.records||[],appointments:value.appointments||[]};
 document.body.dataset.portalState='authenticated';const intro=document.getElementById('intro');if(intro)intro.hidden=true;const help=document.querySelector('.help');if(help)help.hidden=true;
 content.replaceChildren();const shell=node('div','','portal-shell'),side=node('aside','','portal-sidebar');side.setAttribute('aria-label','Sua área do paciente');
 const account=node('div','','account-summary'),avatar=node('span',(data.name.trim()[0]||'P').toUpperCase(),'avatar'),identity=node('div');identity.append(node('span','Área do paciente','account-label'),node('p',data.name,'account-name'));account.append(avatar,identity);side.append(account);
 const nav=node('nav','','portal-navigation');nav.setAttribute('aria-label','Navegação da área do paciente');
 for(const [page,label,kind]of [['home','Início','home'],['videos','Vídeos','video'],['photos','Fotos','photo'],['documents','Documentos','document'],['visits','Atendimentos','visits'],['schedule','Agendamentos','calendar']]){const b=button(label,()=>go({page}),'nav-button',kind);b.dataset.page=page;nav.append(b);}side.append(nav);
 const actions=node('div','','account-actions');actions.append(button('Trocar senha',changePassword,'text-button','account'),button('Sair',async()=>{try{await api({action:'logout'});login();}catch(error){handleError(error);}},'text-button','logout'));side.append(actions);
 const note=node('div','','private-note');note.append(icon('lock'),node('span','Acesso individual'));side.append(note);
 workspace=node('section','','portal-workspace');workspace.setAttribute('aria-label','Conteúdo da minha área');shell.append(side,workspace);content.append(shell);current={page:'home'};render();
}
function renderHome(){
 const welcome=node('div','','welcome-panel');welcome.append(node('p','Bem-vindo à sua área','eyebrow'),node('h1','Olá, '+data.name.split(' ')[0]+'.'),node('p','Seus arquivos e atendimentos, organizados para você.','welcome-text'));const badge=node('span','Meu cuidado','welcome-badge');welcome.append(badge);workspace.append(welcome);
 workspace.append(node('h2','O que você deseja acessar?','section-heading'));
 const grid=node('div','','category-grid');
 for(const [page,title,description,kind,count]of [
 ['videos','Vídeos','Abra a biblioteca e escolha o vídeo que deseja assistir.','video',plural(filesFor('videos').length,'vídeo disponível','vídeos disponíveis')],
 ['photos','Fotos','Consulte as imagens compartilhadas com você.','photo',plural(filesFor('photos').length,'foto disponível','fotos disponíveis')],
 ['documents','Documentos','Relatórios, recibos e outros documentos por data.','document',plural(filesFor('documents').length,'documento disponível','documentos disponíveis')],
 ['visits','Atendimentos','Selecione uma data para consultar evoluções e relatórios.','visits',plural(days().length,'data disponível','datas disponíveis')]
 ]){const b=button('',()=>go({page}),'category-card');b.dataset.category=page;b.replaceChildren();const top=node('span','','category-top'),visual=node('span','','category-icon');visual.append(icon(kind));top.append(visual,node('span',count,'count-badge'));b.append(top,node('span',title,'category-title'),node('span',description,'category-description'));const more=node('span','','category-more');more.append(node('span',page==='visits'?'Ver atendimentos':'Abrir biblioteca'),icon('arrow'));b.append(more);grid.append(b);}workspace.append(grid);
 const next=upcoming()[0],card=node('section','','next-appointment'),visual=node('span','','row-icon');visual.append(icon('calendar'));const copy=node('div');copy.append(node('p','Próximo atendimento','eyebrow'),node('h2',next?dayLabel(next.date):'Nenhum atendimento agendado.'));if(next)copy.append(node('p',[next.time,next.status].filter(Boolean).join(' · ')));card.append(visual,copy,button('Ver agendamentos',()=>go({page:'schedule'}),'action secondary','arrow'));workspace.append(card);
}
function searchBar(onSearch,value=''){const bar=node('div','','library-toolbar'),label=node('label','','search-field');label.append(icon('search'));const input=node('input');input.type='search';input.placeholder='Buscar pelo nome do arquivo';input.setAttribute('aria-label','Buscar arquivos');input.value=value;input.oninput=()=>onSearch(input.value);label.append(input);bar.append(label);return bar;}
function renderLibrary(kind,subset=null,parent={page:'home'},title=''){
 const all=subset||filesFor(kind),meta=kinds[kind];header(title||meta.title,'Selecione um arquivo para visualizar.',parent);
 const summary=node('p',plural(all.length,meta.one+' disponível',meta.many+' disponíveis'),'library-count'),list=node('div','','file-list');workspace.append(summary);
 const key=current.page+':'+(current.date||'');const draw=value=>{searches[key]=value;list.replaceChildren();const visible=all.filter(f=>textKey(f.name).includes(textKey(value)));if(!visible.length){list.append(empty(all.length?'Nenhum arquivo encontrado nessa busca.':'Nenhum arquivo disponível nesta biblioteca.'));return;}for(const f of visible){const row=selection(f.name,dayLabel(f.date),meta.icon,()=>go({page:'file',id:f.id,parent:current,ids:visible.map(x=>x.id),section:kind}),{'data-file-id':f.id});list.append(row);}};
 workspace.append(searchBar(draw,searches[key]||''),list);draw(searches[key]||'');
}
function renderDays(documentsOnly){
 const list=days(documentsOnly);header(documentsOnly?'Documentos':'Atendimentos',documentsOnly?'Escolha uma data para consultar seus documentos.':'Escolha uma data para consultar evoluções e relatórios.',{page:'home'});
 if(!list.length){workspace.append(empty(documentsOnly?'Nenhum documento disponível.':'Nenhum atendimento concluído disponível.'));return;}
 const toolbar=node('div','','library-toolbar'),label=node('label','','date-filter');label.append(node('span','Filtrar por data'));const filter=node('input');filter.type='date';filter.setAttribute('aria-label','Filtrar por data');label.append(filter);toolbar.append(label);workspace.append(toolbar);
 const rows=node('div','','date-list');workspace.append(rows);
 const draw=()=>{rows.replaceChildren();const visible=list.filter(d=>!filter.value||d.key===filter.value);if(!visible.length){rows.append(empty('Nenhum registro nessa data.'));return;}for(const d of visible){const details=[d.records.length?plural(d.records.length,'registro','registros'):'',d.files.length?plural(d.files.length,'documento','documentos'):''].filter(Boolean).join(' · ');rows.append(selection(dayLabel(d.key),details,'calendar',()=>go({page:documentsOnly?'document-day':'visit-day',date:d.key,section:documentsOnly?'documents':'visits'}),{'data-day':d.key}));}};filter.oninput=draw;draw();
}
function renderDay(){
 const d=days().find(x=>x.key===current.date);header('Atendimentos de '+dayLabel(current.date),'Selecione o registro ou documento que deseja consultar.',{page:'visits'});
 if(!d){workspace.append(empty('Nenhum registro disponível nessa data.'));return;}
 workspace.append(node('h2','Evoluções e registros','section-heading'));const records=node('div','','file-list');
 if(!d.records.length)records.append(empty('Nenhuma evolução disponível nesta data.'));
 for(const index of d.records){const r=data.records[index];records.append(selection(r.type||'Registro do atendimento',dayLabel(r.date),'visits',()=>go({page:'record',index,parent:current,section:'visits'}),{'data-record-index':index}));}workspace.append(records);
 workspace.append(node('h2','Documentos desta data','section-heading'));const docs=node('div','','file-list');if(!d.files.length)docs.append(empty('Nenhum documento disponível nesta data.'));for(const f of d.files)docs.append(selection(f.name,'PDF','document',()=>go({page:'file',id:f.id,parent:current,ids:d.files.map(x=>x.id),section:'visits'}),{'data-file-id':f.id}));workspace.append(docs);
}
function renderRecord(){
 const r=data.records[current.index];header(r?.type||'Registro do atendimento',r?dayLabel(r.date):'',current.parent||{page:'visits'});if(!r){workspace.append(empty('Registro não encontrado.'));return;}
 const article=node('article','','clinical-record');for(const field of r.fields||[]){const section=node('section','','record-field');section.append(node('h2',field.label),node('p',field.text));article.append(section);}workspace.append(article);
}
async function renderFile(stamp){
 const f=data.media.find(x=>x.id===current.id),view=current;header(f?.name||'Arquivo',f?dayLabel(f.date):'',view.parent||{page:'home'});if(!f){workspace.append(empty('Arquivo não encontrado.'));return;}
 const back=button('Voltar à lista de arquivos',()=>go(view.parent||{page:'home'}),'action secondary','back'),stage=node('div','','media-stage');stage.append(node('p','Carregando arquivo…','loading-state'));workspace.append(back,stage);
 const ids=view.ids||[],position=ids.indexOf(f.id);if(ids.length>1){const pagination=node('div','','file-pagination');const previous=button('Anterior',()=>go({...view,id:ids[position-1]}),'action secondary','back'),next=button('Próximo',()=>go({...view,id:ids[position+1]}),'action secondary','arrow');previous.disabled=position<=0;next.disabled=position>=ids.length-1;pagination.append(previous,node('span','Arquivo '+(position+1)+' de '+ids.length),next);workspace.append(pagination);}
 try{
  const result=await api(undefined,'?action=file&id='+encodeURIComponent(f.id));if(stamp!==epoch)return;const url=new URL(result.url,location.origin);if(url.protocol!=='https:')throw Error('Não foi possível abrir este arquivo.');stage.replaceChildren();
  if(f.type==='application/pdf'){stage.classList.add('document-stage');stage.append(icon('document'),node('h2',f.name));const link=node('a','Visualizar documento','action');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';stage.append(link);return;}
  const media=document.createElement(f.type.startsWith('video/')?'video':'img');if(media.tagName==='VIDEO'){media.controls=true;media.preload='metadata';media.playsInline=true;activeVideo=media;}else media.alt=f.name;
  media.onerror=()=>{if(stamp!==epoch)return;stage.replaceChildren(node('p','Não foi possível carregar o arquivo.'),button('Tentar novamente',()=>go(view),'action'));};media.src=url.href;stage.append(media);
 }catch(error){if(stamp!==epoch)return;if(error.status===401){handleError(error);return;}stage.replaceChildren(node('p',error.message),button('Tentar novamente',()=>go(view),'action'));}
}
function renderSchedule(){header('Agendamentos','Seus próximos atendimentos.',{page:'home'});const list=upcoming();if(!list.length){workspace.append(empty('Nenhum atendimento agendado.'));return;}const rows=node('div','','appointment-list');for(const a of list){const card=node('article','','appointment-card'),visual=node('span','','row-icon');visual.append(icon('calendar'));const copy=node('div');copy.append(node('h2',dayLabel(a.date)),node('p',a.time||'Horário a confirmar'));card.append(visual,copy,node('span',a.status||'Agendado','count-badge'));rows.append(card);}workspace.append(rows);}
function render(){
 if(!data||!workspace)return;say('');workspace.replaceChildren();const stamp=++epoch;
 for(const b of content.querySelectorAll('.nav-button')){if(b.dataset.page===navPage(current))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 if(current.page==='home')renderHome();else if(current.page==='videos'||current.page==='photos')renderLibrary(current.page);else if(current.page==='documents')renderDays(true);else if(current.page==='visits')renderDays(false);else if(current.page==='document-day')renderLibrary('documents',filesFor('documents').filter(f=>dayKey(f.date)===current.date),{page:'documents'},'Documentos de '+dayLabel(current.date));else if(current.page==='visit-day')renderDay();else if(current.page==='record')renderRecord();else if(current.page==='file')void renderFile(stamp);else if(current.page==='schedule')renderSchedule();
}
async function home(){const result=await api();enter(result);}
if(token)activate();else{content.append(node('p','Carregando seu acesso…','loading-state'));home().catch(error=>login(error.status===401?'':error.message));}
})();
