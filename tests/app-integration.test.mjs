import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import jsdom from 'jsdom';const {JSDOM,VirtualConsole}=jsdom;
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function app({result,stored,fetcher,setup}={}){
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="([^"]+)"><\/script>/g,(_,name)=>'<script>'+fs.readFileSync(path.join(root,name),'utf8')+'</script>'),{url:'https://olhan.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.confirm=()=>false;w.crypto.randomUUID=()=>Math.random().toString(36).slice(2);w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};w.sessionStorage.setItem('olhan-ai-access','test-access');if(stored)w.localStorage.setItem('olhan-v1',JSON.stringify(stored));
  w.URL.createObjectURL=()=> 'blob:https://olhan.test/test';w.URL.revokeObjectURL=()=>{};if(setup)setup(w);
  w.fetch=fetcher||(async(_url,options)=>({ok:true,json:async()=>options?.method==='POST'?result:{configured:true,connected:true}}));
 }});
 await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(errors.length,0,errors.map(e=>e.message).join('\n'));return dom;
}
const fields={general:'Narrativa extraída',pa:'120/80',fc:'80',spo:'98',pain:'0',paFinal:'110/70',fcFinal:'78',spoFinal:'99',painFinal:'0',conduct:'Mobilidade relatada',goal:'Orientação relatada',warnings:[]};
test('carrega todos os scripts V16 e abre assistente no menu',async()=>{const dom=await app();const w=dom.window;w.go('assistant');assert.match(w.document.getElementById('app').textContent,/Como posso ajudar/);assert.ok(w.OlhanSchedule);assert.ok(w.OlhanAssistantCore);dom.window.close()});
test('preenchimento de evolução preserva manual, zero e sinais finais sem salvar automaticamente',async()=>{const dom=await app({result:{fields,text:'Relato fictício'}});const w=dom.window;w.recordForm('p1','b0');const f=w.document.getElementById('form');f.elements.general.value='Texto manual';f.elements.fc.value='75';f.querySelector('#evolution-ai-draft').value='Relato fictício';await w.olhanEvolutionAI(false);assert.equal(f.querySelector('[data-ai-field="general"]').checked,false);assert.equal(f.querySelector('[data-ai-field="fc"]').checked,false);w.olhanApplyEvolutionAI();assert.equal(f.elements.general.value,'Texto manual');assert.equal(f.elements.fc.value,'75');assert.equal(f.elements.pain.value,'0');assert.equal(f.elements.fcFinal.value,'78');assert.equal(f.elements.conduct.value,'Mobilidade relatada');const saved=JSON.parse(w.localStorage.getItem('olhan-v1'));assert.equal(saved.records.length,1);dom.window.close()});
test('um sinal inválido bloqueia o preenchimento inteiro e mantém os campos',async()=>{const dom=await app({result:{fields:{...fields,spo:'150'},text:'Relato'}});const w=dom.window;w.recordForm('p1','b0');const f=w.document.getElementById('form');f.querySelector('#evolution-ai-draft').value='Relato';await w.olhanEvolutionAI(false);w.olhanApplyEvolutionAI();assert.equal(f.elements.general.value,'');assert.equal(f.elements.conduct.value,'');assert.match(f.querySelector('#evolution-ai-status').textContent,/Confira o valor/);dom.window.close()});
test('assistente só aplica cadastro após revisão e confirmação',async()=>{const proposal={message:'Proposta pronta',actions:[{entity:'patient',operation:'create',id:'',fields:[{key:'name',value:'Pessoa teste'},{key:'pro',value:'pA'},{key:'price',value:'150'}]}]};const dom=await app({result:{proposal}});const w=dom.window;w.go('assistant');w.document.getElementById('assistant-command').value='Cadastrar Pessoa teste';w.document.getElementById('assistant-send').click();await tick();let saved=JSON.parse(w.localStorage.getItem('olhan-v1'));assert.equal(saved.patients.length,4);assert.match(w.document.getElementById('app').textContent,/Revise a proposta/);w.olhanApplyAI();saved=JSON.parse(w.localStorage.getItem('olhan-v1'));assert.equal(saved.patients.length,5);assert.equal(saved.patients.at(-1).name,'Pessoa teste');dom.window.close()});
test('comando de horário abre confirmação de alcance sem modificar a agenda',async()=>{const proposal={message:'Confira',actions:[{entity:'appointment',operation:'update',id:'c1',fields:[{key:'time',value:'10:00'}]}]};const dom=await app({result:{proposal}});const w=dom.window;w.go('assistant');w.document.getElementById('assistant-command').value='Alterar horário';await w.olhanAskAI();w.olhanApplyAI();assert.match(w.document.getElementById('modal').textContent,/Somente esta sessão/);assert.equal(JSON.parse(w.localStorage.getItem('olhan-v1')).appointments.find(a=>a.id==='c1').time,'08:00');w.closeModal();assert.equal(JSON.parse(w.localStorage.getItem('olhan-v1')).appointments.find(a=>a.id==='c1').time,'08:00');dom.window.close()});
test('contrato da equipe mantém corpo e versão após migrações antigas do aplicativo',async()=>{const initial=await app();const data=JSON.parse(initial.window.localStorage.getItem('olhan-v1'));initial.window.close();data.contracts.push({id:'team-test',contractType:'team',templateKey:'team_ip',templateVersion:3,status:'Rascunho',body:'CORPO INTEGRAL ORIGINAL DA EQUIPE',clientName:'Pessoa fictícia',created:new Date().toISOString()});const dom=await app({stored:data});const saved=JSON.parse(dom.window.localStorage.getItem('olhan-v1'));assert.equal(saved.contracts[0].body,'CORPO INTEGRAL ORIGINAL DA EQUIPE');assert.equal(saved.contracts[0].templateVersion,3);dom.window.close()});
test('preenchimento dos dois modelos substitui só identificação e preserva condições',async()=>{const dom=await app();const fill=dom.window.OlhanTeamContracts.fill;const person={clientName:'Pessoa Teste',clientCpf:'CPF TESTE',rg:'RG TESTE',crefito:'REG TESTE',clientAddress:'Endereço fictício',email:'teste@example.com',maritalStatus:'Solteira',role:'Fisioterapeuta',contractDate:'2026-10-21'};const ip=fill('[NOME COMPLETO], [estado civil], [profissão], CPF [ xxx ], RG [ xxx], [órgão profissional, se aplicável] [ xxx], [endereço completo, com CEP], e-mail [ xxx ]. Multa R$ 10.000,00.',person,'team_ip');assert.ok(!ip.includes('['));assert.match(ip,/10.000,00/);const service=fill('Nome, inscrita no CPF nº _ e CREFITO nº _.\neu, Nome, portador(a) do CPF nº _ e RG nº _, residente e domiciliado(a) em _,\n60% do valor líquido. (definir política)\nLimeira, _____ de ____________ de _______.',person,'team_service');assert.match(service,/Pessoa Teste/);assert.match(service,/60% do valor líquido/);assert.match(service,/definir política/);assert.ok(!service.includes('eu, Nome'));dom.window.close()});

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function chooseAudio(w,size=9,type='audio/webm'){w.olhanAssistantAudioFile({files:[new w.File([new Uint8Array(size)],'pedido.webm',{type})],value:'file'});}
test('áudio transcrito é acrescentado ao texto manual sem preparar ou executar ações',async()=>{const calls=[];const dom=await app({fetcher:async(url,options)=>{if(options?.method==='POST')calls.push(JSON.parse(options.body));return {ok:true,json:async()=>options?.method==='POST'?{text:'Mudar o atendimento para dez horas.'}:{configured:true,connected:true}}}});const w=dom.window;w.go('assistant');const before=w.localStorage.getItem('olhan-v1');w.document.getElementById('assistant-command').value='Pedido manual';chooseAudio(w);await w.olhanAssistantTranscribe();assert.equal(w.document.getElementById('assistant-command').value,'Pedido manual\n\nMudar o atendimento para dez horas.');assert.equal(calls.length,1);assert.equal(calls[0].mode,'transcribe');assert.equal(w.localStorage.getItem('olhan-v1'),before);assert.equal(w.document.querySelector('.v16-review'),null);assert.match(w.document.getElementById('assistant-audio-status').textContent,/Nenhum dado foi alterado/);w.close();});
test('falha e áudio acima do limite preservam o pedido sem enviar arquivo inválido',async()=>{let posts=0;const dom=await app({fetcher:async(_url,options)=>{if(options?.method==='POST')posts++;return {ok:options?.method!=='POST',json:async()=>options?.method==='POST'?{error:'Falha simulada'}:{configured:true,connected:true}}}});const w=dom.window;w.go('assistant');w.document.getElementById('assistant-command').value='Não perder';chooseAudio(w,2500001);assert.match(w.document.getElementById('assistant-audio-status').textContent,/2,5 MB/);await w.olhanAssistantTranscribe();assert.equal(posts,0);chooseAudio(w);await w.olhanAssistantTranscribe();assert.equal(posts,1);assert.equal(w.document.getElementById('assistant-command').value,'Não perder');assert.match(w.document.getElementById('assistant-audio-status').textContent,/Falha simulada/);w.close();});
test('sair durante transcrição cancela e ignora resposta atrasada',async()=>{let resolve,signal,started;const postStarted=new Promise(r=>started=r);const dom=await app({fetcher:async(_url,options)=>{if(options?.method==='POST'){signal=options.signal;await new Promise(r=>{resolve=r;started()});return {ok:true,json:async()=>({text:'Resposta antiga'})};}return {ok:true,json:async()=>({configured:true,connected:true})}}});const w=dom.window;w.go('assistant');w.document.getElementById('assistant-command').value='Pedido anterior';chooseAudio(w);const pending=w.olhanAssistantTranscribe();await postStarted;w.go('home');assert.equal(signal.aborted,true);w.go('assistant');resolve();await pending;assert.equal(w.document.getElementById('assistant-command').value,'Pedido anterior');assert.equal(w.document.getElementById('assistant-audio-player').hidden,true);w.close();});
test('sair enquanto aguarda permissão do microfone encerra stream tardio',async()=>{let allow,stops=0;const dom=await app({setup(w){Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>allow=r)}});w.MediaRecorder=class{};}});const w=dom.window;w.go('assistant');const pending=w.olhanAssistantRecord();w.go('home');allow({getTracks:()=>[{stop(){stops++}}]});await pending;assert.equal(stops,1);w.close();});
test('gravação encerra microfone ao navegar e descarta o áudio',async()=>{let stops=0,recorder;const dom=await app({setup(w){Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++}}]})}});w.MediaRecorder=class{static isTypeSupported(){return true}constructor(){recorder=this;this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new w.Blob(['audio'],{type:'audio/webm'})});this.onstop?.()}};}});const w=dom.window;w.go('assistant');await w.olhanAssistantRecord();assert.equal(recorder.state,'recording');w.go('home');assert.equal(recorder.state,'inactive');assert.ok(stops>=1);w.go('assistant');assert.equal(w.document.getElementById('assistant-audio-player').hidden,true);w.close();});
test('IA usa login sem solicitar código nem enviar segredo no navegador',async()=>{const calls=[];const dom=await app({fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({configured:true,connected:true})}}});const w=dom.window;w.go('assistant');w.document.getElementById('assistant-command').value='Pedido ainda não enviado';await w.olhanRefreshAI();assert.equal(w.document.getElementById('assistant-command').value,'Pedido ainda não enviado');assert.equal(w.document.querySelector('[name="code"]'),null);assert.ok(!w.document.getElementById('app').textContent.includes('Conectar IA'));assert.equal(w.sessionStorage.getItem('olhan-ai-access'),null);assert.ok(!calls.some(c=>c.url==='/api/ai-access'));w.close();});
test('configurações R2 verificam conexão sem solicitar chave e mantêm envios bloqueados',async()=>{
 const calls=[];let answer;
 const dom=await app({fetcher:async(url,options)=>{calls.push({url,options});if(url==='/api/storage')return await new Promise(resolve=>answer=resolve);return {ok:true,json:async()=>({configured:true})}}});
 const w=dom.window;w.go('settings');const initial=w.localStorage.getItem('olhan-v1');
 const button=w.document.getElementById('storage-check');assert.ok(button);button.click();assert.equal(button.disabled,true);assert.match(w.document.getElementById('storage-status').textContent,/Verificando/);
 answer({ok:true,json:async()=>({configured:true,connected:true,uploadsEnabled:false,accessEnabled:false})});await tick();
 assert.match(w.document.getElementById('storage-status').textContent,/R2 conectado.*Anexos privados/);assert.equal(button.disabled,false);assert.equal(w.localStorage.getItem('olhan-v1'),initial);
 assert.ok(calls.some(c=>c.url==='/api/storage'&&!c.options.body));assert.equal(w.document.querySelector('[name="R2_SECRET_ACCESS_KEY"]'),null);w.close();
});


test('servidor confirma salvamento sem gravar dados novos no localStorage',async()=>{
 const requests=[];let finish;
 const dom=await app({setup(w){w.__OLHAN_CLOUD__={revision:1,data:null,role:'admin'};},fetcher:async(url,options)=>{if(url==='/api/workspace'){requests.push(JSON.parse(options.body));return await new Promise(resolve=>finish=resolve);}return {ok:true,json:async()=>({configured:true,connected:true})};}});
 const w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));
 const before=w.localStorage.getItem('olhan-v1');w.eval('db.patients[0].name="Teste no servidor";save()');
 assert.match(w.document.getElementById('cloud-status').textContent,/Salvando/);assert.equal(w.localStorage.getItem('olhan-v1'),before);
 await tick();finish({ok:true,json:async()=>({revision:2})});await w.OlhanCloud.flush();
 assert.equal(requests[0].data.patients[0].name,'Teste no servidor');assert.equal(w.localStorage.getItem('olhan-v1'),before);assert.match(w.document.getElementById('cloud-status').textContent,/Salvo no servidor/);w.close();
});
test('falha do servidor mantém alterações exportáveis e bloqueia confirmação falsa',async()=>{
 const dom=await app({setup(w){w.__OLHAN_CLOUD__={revision:1,data:null,role:'admin'};},fetcher:async(url)=>({ok:url!=='/api/workspace',json:async()=>url==='/api/workspace'?{error:'Conflito de revisão'}:{configured:true,connected:true}})});
 const w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));w.eval('db.patients[0].name="Não perder";save()');
 await assert.rejects(w.OlhanCloud.flush());assert.equal(w.eval('db.patients[0].name'),'Não perder');assert.equal(w.OlhanCloud.status().blocked,true);assert.match(w.document.getElementById('cloud-status').textContent,/Exporte/);w.close();
});

test('suporte abre base vazia sem aguardar importação da administradora',async()=>{
 const seed=await app(),legacy=JSON.parse(seed.window.localStorage.getItem('olhan-v1'));seed.window.close();const calls=[];
 const empty={patients:[],team:[],appointments:[],records:[],invoices:[],files:[]};
 const dom=await app({stored:legacy,setup(w){w.__OLHAN_CLOUD__={revision:0,data:null,role:'support'};},fetcher:async(url,options)=>{if(url==='/api/workspace')calls.push(JSON.parse(options.body));return {ok:true,json:async()=>url==='/api/workspace'?{revision:1,data:empty}:{configured:true,connected:true}};}});
 const w=dom.window,before=w.localStorage.getItem('olhan-v1');w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));await tick();
 assert.equal(calls.length,1);assert.equal(calls[0].action,'initialize');assert.equal(calls[0].data,undefined);assert.equal(w.localStorage.getItem('olhan-v1'),before);assert.ok(!w.document.body.textContent.includes('Aguardando importação pela administradora'));w.close();
 const opened=await app({setup(w){w.__OLHAN_CLOUD__={revision:1,data:empty,role:'support'};}}),s=opened.window;s.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));s.go('patients');assert.equal(s.eval('db.patients.length'),0);assert.equal(s.OlhanCloud.status().ready,true);s.go('agenda');s.go('settings');s.close();
});
test('administradora pode importar cópia antiga depois de entrar sem bloquear o sistema',async()=>{
 const seed=await app(),legacy=JSON.parse(seed.window.localStorage.getItem('olhan-v1'));seed.window.close();
 const server={patients:[{id:'server-patient',name:'Servidor',status:'Ativo'}],team:[],appointments:[],records:[],invoices:[],files:[]};let written;
 const dom=await app({stored:legacy,setup(w){w.__OLHAN_CLOUD__={revision:1,data:server,role:'admin'};},fetcher:async(url,options)=>{if(url==='/api/workspace')written=JSON.parse(options.body);return {ok:true,json:async()=>url==='/api/workspace'?{revision:2}:{configured:true,connected:true}};}});
 const w=dom.window,before=w.localStorage.getItem('olhan-v1');w.confirm=()=>true;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));assert.ok(w.document.getElementById('cloud-import-legacy'));w.go('patients');w.document.getElementById('cloud-import-legacy').click();await tick();await tick();assert.ok(written.data.patients.some(p=>p.id==='server-patient'));assert.ok(written.data.patients.some(p=>p.id===legacy.patients[0].id));assert.equal(w.localStorage.getItem('olhan-v1'),before);assert.equal(w.OlhanCloud.status().revision,2);w.close();
});

test('exclusão de agenda permite revisar uma sessão ou toda a recorrência e cancelar sem alteração',async()=>{
 const dom=await app(),w=dom.window;
 w.eval("db.appointments.find(a=>a.id==='c1').seriesId='delete-series';db.appointments.push({...db.appointments.find(a=>a.id==='c1'),id:'future-delete',date:add(today,9),time:'11:00'});save()");
 const before=w.localStorage.getItem('olhan-v1');w.appointmentForm('c1');assert.match(w.document.getElementById('form').textContent,/Excluir agendamento/);w.olhanDeleteRequest('appointment','c1');
 assert.equal(w.localStorage.getItem('olhan-v1'),before);const radio=w.document.querySelector('[name="deleteScope"][value="future"]');radio.checked=true;radio.dispatchEvent(new w.Event('change'));
 assert.match(w.document.getElementById('deletion-preview').textContent,/2 agendamento/);w.closeModal();assert.equal(w.localStorage.getItem('olhan-v1'),before);
 w.olhanDeleteRequest('appointment','c1');w.document.getElementById('deletion-confirm').checked=true;await w.olhanDeletionConfirm();const data=JSON.parse(w.localStorage.getItem('olhan-v1'));assert.ok(!data.appointments.some(a=>a.id==='c1'));assert.ok(data.appointments.some(a=>a.id==='future-delete'));w.olhanOpenTrash();assert.match(w.document.getElementById('form').textContent,/Restaurar/);dom.window.close();
});
test('exclusão de paciente preserva nome no financeiro, registros e anexos e permite restaurar cadastro',async()=>{
 const dom=await app(),w=dom.window;w.patientForm('p1');assert.match(w.document.getElementById('form').textContent,/Excluir paciente/);const records=w.eval('JSON.stringify(db.records)');
 w.olhanDeleteRequest('patient','p1');w.document.getElementById('deletion-confirm').checked=true;await w.olhanDeletionConfirm();assert.equal(w.eval("db.patients.some(p=>p.id==='p1')"),false);assert.equal(w.eval('JSON.stringify(db.records)'),records);assert.equal(w.eval("patient('p1').name"),'Helena Duarte');
 w.go('patients');assert.ok(!w.document.getElementById('patientcards').textContent.includes('Helena Duarte'));assert.match(w.document.getElementById('app').textContent,/Lixeira/);
 w.olhanDeletedHistory('p1');assert.match(w.document.getElementById('form').textContent,/Registro fictício/);const ref=w.eval("db.recycleBin.find(x=>x.kind==='patient').id");w.olhanRestoreRequest(ref);w.document.getElementById('deletion-confirm').checked=true;await w.olhanDeletionConfirm();assert.equal(w.eval("db.patients.some(p=>p.id==='p1')"),true);dom.window.close();
});
test('falha de servidor na exclusão mantém os dados e a revisão aberta, sem sucesso falso',async()=>{
 const dom=await app({setup(w){w.__OLHAN_CLOUD__={revision:7,data:null,role:'admin'};},fetcher:async(url,options)=>({ok:JSON.parse(options?.body||'{}').action!=='manage-exclusions',json:async()=>JSON.parse(options?.body||'{}').action==='manage-exclusions'?{error:'Falha simulada de confirmação'}:{configured:true}})}),w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));
 const before=w.eval('JSON.stringify(db)');w.olhanDeleteRequest('appointment','c1');w.document.getElementById('deletion-confirm').checked=true;await w.olhanDeletionConfirm();assert.equal(w.eval('JSON.stringify(db)'),before);assert.match(w.document.getElementById('deletion-error').textContent,/Falha simulada/);assert.equal(w.document.getElementById('modal').open,true);assert.equal(w.document.querySelector('#form button[type="submit"]').disabled,false);w.close();
});
test('exclusão online só altera a interface depois da confirmação do servidor',async()=>{
 let reply,started;const sent=new Promise(r=>started=r);
 const dom=await app({setup(w){w.__OLHAN_CLOUD__={revision:7,data:null,role:'admin'};},fetcher:async(url,options)=>{if(url==='/api/workspace'&&JSON.parse(options?.body||'{}').action==='manage-exclusions'){started();return new Promise(r=>reply=r);}return {ok:true,json:async()=>({configured:true})};}}),w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));
 const before=w.eval('JSON.stringify(db)'),plan=w.OlhanDeletionCore.prepare(JSON.parse(before),'appointment','c1'),next=w.OlhanDeletionCore.apply(JSON.parse(before),plan,{makeId:()=> 'server-trash',now:new Date().toISOString(),actor:'admin'});
 w.olhanDeleteRequest('appointment','c1');w.document.getElementById('deletion-confirm').checked=true;const pending=w.olhanDeletionConfirm();await sent;assert.equal(w.eval('JSON.stringify(db)'),before);assert.equal(w.document.querySelector('#form button[type="submit"]').disabled,true);reply({ok:true,json:async()=>({revision:8,data:next})});await pending;assert.equal(w.eval("db.appointments.some(a=>a.id==='c1')"),false);assert.equal(w.OlhanCloud.status().revision,8);assert.equal(w.document.getElementById('modal').open,false);w.close();
});
test('importação antiga não ressuscita paciente nem agendamento já excluído',async()=>{
 const seed=await app(),legacy=JSON.parse(seed.window.localStorage.getItem('olhan-v1')),core=seed.window.OlhanDeletionCore;
 const server=core.apply(legacy,core.prepare(legacy,'patient','p1'),{makeId:(()=>{let n=0;return()=>`excluded-${++n}`})(),now:new Date().toISOString(),actor:'admin'});seed.window.close();let written;
 const dom=await app({stored:legacy,setup(w){w.__OLHAN_CLOUD__={revision:7,data:server,role:'admin'};},fetcher:async(url,options)=>{if(url==='/api/workspace')written=JSON.parse(options.body);return {ok:true,json:async()=>url==='/api/workspace'?{revision:8}:{configured:true}};}}),w=dom.window;w.confirm=()=>true;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));w.document.getElementById('cloud-import-legacy').click();await tick();await tick();assert.ok(!written.data.patients.some(p=>p.id==='p1'));assert.ok(!written.data.appointments.some(a=>a.id==='c1'));assert.equal(written.data.recycleBin.length,2);w.close();
});

async function financeScheduleApp(options={}){
 const originalSetup=options.setup;
 return app({...options,setup(w){const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-14T15:00:00Z']))}static now(){return NativeDate.parse('2026-11-14T15:00:00Z')}};originalSetup?.(w);}});
}
function recurringForm(w,{frequency='fortnight',kind='count',count=4,start='2026-12-07',until='2027-01-04',day='1'}={}){
 w.appointmentForm(undefined,{patient:'p2',pro:'pB',date:start,time:'10:00'});
 const f=w.document.getElementById('form');f.elements.repeatKind.value=kind;f.elements.weeklyFrequency.value=frequency;f.elements.repeatCount.value=String(count);f.elements.repeatUntil.value=until;f.elements.slot1Day.value=day;f.elements.slot1Time.value='10:00';f.elements.slot2Day.value='3';f.elements.slot2Time.value='10:00';w.toggleScheduleFields();return f;
}
const submitForm=(w,f)=>f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
test('agendamento quinzenal mantém o dia da semana e intervalo de 14 dias na virada do ano',async()=>{
 const dom=await financeScheduleApp(),w=dom.window,f=recurringForm(w);
 assert.match(f.textContent,/Quinzenal · a cada 2 semanas/);assert.equal(f.querySelectorAll('[data-slot-row]:not(.v5-slot-hidden)').length,1);submitForm(w,f);
 const created=w.eval('db.appointments.filter(a=>a.recurrenceIntervalWeeks===2)');assert.deepEqual(Array.from(created,a=>a.date),['2026-12-07','2026-12-21','2027-01-04','2027-01-18']);assert.equal(new Set(created.map(a=>a.seriesId)).size,1);assert.equal(w.eval("patient('p2').frequency"),'Quinzenal');w.close();
});
test('quinzenal até uma data inclui o último dia e começa no próximo dia da semana escolhido',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;submitForm(w,recurringForm(w,{kind:'until',start:'2026-12-01',until:'2027-01-04'}));assert.deepEqual(Array.from(w.eval('db.appointments.filter(a=>a.recurrenceIntervalWeeks===2)'),a=>a.date),['2026-12-07','2026-12-21','2027-01-04']);w.close();
});
test('quinzenal gera a quantidade inteira de 300 sessões sem truncar o período',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;submitForm(w,recurringForm(w,{count:300}));const created=w.eval('db.appointments.filter(a=>a.recurrenceIntervalWeeks===2)');assert.equal(created.length,300);assert.equal((Date.parse(created.at(-1).date)-Date.parse(created[0].date))/86400000,299*14);w.close();
});
test('frequência semanal continua gerando os dois dias por semana',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;submitForm(w,recurringForm(w,{frequency:'2',count:6}));assert.deepEqual(Array.from(w.eval('db.appointments.filter(a=>a.recurrenceIntervalWeeks===1)'),a=>a.date),['2026-12-07','2026-12-09','2026-12-14','2026-12-16','2026-12-21','2026-12-23']);w.close();
});
test('conflito em uma sessão quinzenal bloqueia a série inteira',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;w.eval("db.appointments.push({id:'conflict-biweekly',patient:'p1',pro:'pB',date:'2026-12-21',time:'10:30',duration:60,status:'Agendado'})");const before=w.eval('JSON.stringify(db.appointments)');submitForm(w,recurringForm(w));assert.equal(w.eval('JSON.stringify(db.appointments)'),before);assert.match(w.document.getElementById('toast').textContent,/Conflito/);w.close();
});
test('reagendar e excluir próximas sessões mantém a recorrência quinzenal',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;submitForm(w,recurringForm(w));const first=w.eval('db.appointments.find(a=>a.recurrenceIntervalWeeks===2).id');w.scheduleRequest(first,{time:'11:30'});w.scheduleConfirm('future');const series=w.eval('db.appointments.filter(a=>a.recurrenceIntervalWeeks===2)');assert.ok(series.every(a=>a.time==='11:30'));assert.deepEqual(Array.from(series,a=>a.date),['2026-12-07','2026-12-21','2027-01-04','2027-01-18']);const plan=w.OlhanDeletionCore.prepare(w.eval('db'),'appointment',series[1].id,'future');assert.equal(plan.count,3);w.close();
});
test('financeiro abre o mês completo e sinaliza gastos fora do filtro sem alterar lançamentos',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;w.eval("db.cashEntries=[{id:'fixed-1',date:'2026-11-20',type:'saida',category:'Gasto fixo',description:'Gasto fictício A',amount:1},{id:'fixed-2',date:'2026-11-20',type:'saida',category:'Gasto fixo',description:'Gasto fictício B',amount:250}]");const before=w.eval('JSON.stringify(db.cashEntries)');assert.equal(w.eval('financeTo'),'2026-11-30');w.setFinanceTab('Caixa');w.go('finance');assert.match(w.document.getElementById('app').textContent,/Gasto fictício A/);assert.match(w.document.getElementById('app').textContent,/Gasto fictício B/);w.financeSetPeriod('today');assert.match(w.document.getElementById('app').textContent,/2 lançamento\(s\) fora do período/);assert.ok(!w.document.querySelector('.cash-table tbody').textContent.includes('Gasto fictício A'));w.financeSetPeriod('all');assert.match(w.document.querySelector('.cash-table tbody').textContent,/Gasto fictício A/);assert.equal(w.eval('JSON.stringify(db.cashEntries)'),before);w.close();
});
function fillCash(w,{date='2026-12-20',description='Despesa fictícia'}={}){w.cashEntryForm();const f=w.document.getElementById('form');f.elements.type.value='saida';f.elements.category.value='Gasto fixo';f.elements.date.value=date;f.elements.amount.value='250.50';f.elements.description.value=description;return f;}
test('salvar gasto abre o Caixa e amplia o período para mostrar o novo lançamento',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;w.eval("financeFrom='2026-01-01';financeTo='2026-01-31'");submitForm(w,fillCash(w));await tick();assert.equal(w.eval('view'),'finance');assert.equal(w.document.querySelector('.finance-tabs button.active').textContent,'Caixa');assert.equal(w.eval('financeTo'),'2026-12-20');assert.match(w.document.querySelector('.cash-table tbody').textContent,/Despesa fictícia/);assert.equal(w.eval('db.cashEntries[0].amount'),250.5);w.close();
});
test('Caixa aguarda confirmação do servidor e clique duplicado não duplica a despesa',async()=>{
 let reply,started;const sent=new Promise(r=>started=r),requests=[];
 const dom=await financeScheduleApp({setup(w){w.__OLHAN_CLOUD__={revision:7,data:null,role:'admin'};},fetcher:async(url,options)=>{if(url==='/api/workspace'){requests.push(JSON.parse(options.body));started();return new Promise(resolve=>reply=resolve);}return {ok:true,json:async()=>({configured:true})};}}),w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));const f=fillCash(w);submitForm(w,f);submitForm(w,f);await sent;assert.equal(requests.length,1);assert.match(f.querySelector('#cash-save-status').textContent,/Salvando/);assert.equal(f.querySelector('[type="submit"]').disabled,true);reply({ok:true,json:async()=>({revision:8})});await w.OlhanCloud.flush();await tick();assert.equal(w.eval('db.cashEntries.length'),1);assert.equal(w.document.querySelector('.finance-tabs button.active').textContent,'Caixa');assert.match(w.document.querySelector('.cash-table tbody').textContent,/Despesa fictícia/);assert.equal(w.OlhanCloud.status().revision,8);w.close();
});
test('falha no salvamento do gasto mantém formulário e não confirma nem duplica o lançamento',async()=>{
 let posts=0;const dom=await financeScheduleApp({setup(w){w.__OLHAN_CLOUD__={revision:7,data:null,role:'admin'};},fetcher:async(url)=>{if(url==='/api/workspace')posts++;return {ok:url!=='/api/workspace',json:async()=>url==='/api/workspace'?{error:'Falha simulada de gravação'}:{configured:true}};}}),w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));const f=fillCash(w);submitForm(w,f);await tick();await tick();assert.equal(w.document.getElementById('modal').open,true);assert.match(f.querySelector('#cash-save-status').textContent,/sem confirmação/);assert.equal(w.eval('db.cashEntries.length'),1);submitForm(w,f);await tick();assert.equal(w.eval('db.cashEntries.length'),1);assert.equal(posts,1);assert.equal(w.OlhanCloud.status().blocked,true);w.close();
});

test('agenda diferencia realizado, evolução e avaliação em lista, calendário e grade, sem concluir rascunhos',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;
 w.eval(`db.appointments=['done','evolved','assessed','draft','scheduled','cancelled'].map((id,i)=>({id,patient:'p1',pro:'pA',date:today,time:String(8+i).padStart(2,'0')+':00',duration:60,price:100,status:id==='done'?'Realizado':id==='cancelled'?'Cancelado sem cobrança':'Agendado',service:'Fisioterapia domiciliar'}));
 db.records=[{id:'r1',appointment:'evolved',patient:'p1',type:'Evolução'}, {id:'r2',appointment:'assessed',patient:'p1',type:'Avaliação',draft:false}, {id:'r3',appointment:'draft',patient:'p1',type:'Avaliação',draft:true}, {id:'r4',appointment:'cancelled',patient:'p1',type:'Evolução'}, {id:'r5',appointment:'scheduled',patient:'p2',type:'Evolução'}];`);
 const before=w.eval('JSON.stringify(db)');w.go('agenda');
 for(const layout of ['list','calendar','time']){
  w.setAgendaLayout(layout);
  for(const id of ['done','evolved','assessed'])assert.ok(w.document.querySelector(`[data-appointment-id="${id}"] .appointment-check`),layout+' '+id);
  for(const id of ['draft','scheduled','cancelled'])assert.equal(w.document.querySelector(`[data-appointment-id="${id}"] .appointment-check`),null,layout+' '+id);
  assert.match(w.document.querySelector('[data-appointment-id="evolved"]').textContent,/Evolução registrada/);
  assert.match(w.document.querySelector('[data-appointment-id="assessed"]').textContent,/Avaliação registrada/);
 }
 assert.equal(w.eval('JSON.stringify(db)'),before);w.close();
});
test('salvar evolução vinculada passa a mostrar o check na agenda',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;
 w.eval("db.appointments=[{id:'session-note',patient:'p1',pro:'pA',date:today,time:'10:00',duration:60,price:100,status:'Agendado',service:'Fisioterapia domiciliar'}];db.records=[]");
 w.go('agenda');assert.equal(w.document.querySelector('[data-appointment-id="session-note"] .appointment-check'),null);
 w.recordForm('p1','session-note');const form=w.document.getElementById('form');form.elements.general.value='Registro clínico fictício para verificação.';submitForm(w,form);await tick();w.go('agenda');
 assert.match(w.document.querySelector('[data-appointment-id="session-note"]').textContent,/Evolução registrada/);assert.ok(w.document.querySelector('[data-appointment-id="session-note"] .appointment-check'));w.close();
});
function repeatCash(w,f,until){f.elements.category.dispatchEvent(new w.Event('change'));f.elements.repeatMonthly.checked=true;f.elements.repeatMonthly.dispatchEvent(new w.Event('change'));f.elements.repeatUntil.value=until;f.elements.repeatUntil.dispatchEvent(new w.Event('change'));return f;}
test('gasto fixo repete até o mês final inclusive e usa o último dia de fevereiro sem perder o dia 31 em março',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;const f=repeatCash(w,fillCash(w,{date:'2027-01-31'}),'2027-03');
 assert.equal(f.querySelector('#cash-recurring').hidden,false);assert.match(f.querySelector('#cash-repeat-preview').textContent,/3 lançamento/);submitForm(w,f);await tick();
 const rows=Array.from(w.eval('db.cashEntries'));
 assert.deepEqual(rows.map(e=>e.date),['2027-01-31','2027-02-28','2027-03-31']);assert.ok(rows.every(e=>e.amount===250.5));assert.equal(new Set(rows.map(e=>e.id)).size,3);assert.equal(new Set(rows.map(e=>e.recurrenceId)).size,1);
 w.eval("financeFrom='2027-02-01';financeTo='2027-02-28'");w.render();assert.match(w.document.querySelector('.cash-table tbody').textContent,/28 de fev/);assert.equal(w.document.querySelectorAll('.cash-table tbody tr').length,1);w.close();
});
test('repetição atravessa o ano e fevereiro bissexto mantendo os mesmos valores',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;submitForm(w,repeatCash(w,fillCash(w,{date:'2027-12-31'}),'2028-03'));await tick();assert.deepEqual(Array.from(w.eval('db.cashEntries'),e=>e.date),['2027-12-31','2028-01-31','2028-02-29','2028-03-31']);w.close();
});
test('mês final inválido bloqueia a série inteira sem gravar despesas',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;const f=repeatCash(w,fillCash(w,{date:'2027-01-31'}),'2026-12'),before=w.eval('JSON.stringify(db.cashEntries)');submitForm(w,f);await tick();assert.equal(w.eval('JSON.stringify(db.cashEntries)'),before);assert.match(w.document.getElementById('toast').textContent,/mês final/);assert.equal(w.document.getElementById('modal').open,true);w.close();
});
test('cancelar repetição ou trocar para gasto variável não gera meses extras',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;repeatCash(w,fillCash(w),'2027-03');const before=w.eval('JSON.stringify(db.cashEntries)');w.closeModal();assert.equal(w.eval('JSON.stringify(db.cashEntries)'),before);
 const f=repeatCash(w,fillCash(w),'2027-03');f.elements.category.value='Gasto variável';f.elements.category.dispatchEvent(new w.Event('change'));assert.equal(f.querySelector('#cash-recurring').hidden,true);assert.equal(f.elements.repeatUntil.disabled,true);submitForm(w,f);await tick();assert.equal(w.eval('db.cashEntries.length'),1);assert.equal(w.eval('db.cashEntries[0].recurrenceId'),undefined);w.close();
});
test('repetir gasto já cadastrado preserva o original e acrescenta somente os meses seguintes',async()=>{
 const dom=await financeScheduleApp(),w=dom.window;w.eval("db.cashEntries=[{id:'existing-fixed',date:'2026-11-30',type:'saida',category:'Gasto fixo',description:'Despesa cadastrada',amount:123.45,pro:'pA'},{id:'unrelated',date:'2026-11-20',type:'saida',category:'Gasto fixo',description:'Outra despesa',amount:9}]");
 w.setFinanceTab('Caixa');w.go('finance');assert.match(w.document.querySelector('.cash-table tbody').textContent,/Repetir mensalmente/);
 w.cashEntryForm('existing-fixed');const f=w.document.getElementById('form');assert.equal(f.elements.amount.readOnly,true);f.elements.repeatUntil.value='2027-01';submitForm(w,f);await tick();
 const rows=Array.from(w.eval('db.cashEntries'));assert.equal(rows.length,4);assert.equal(rows.filter(e=>e.id==='existing-fixed').length,1);assert.deepEqual(rows.filter(e=>e.recurrenceId).map(e=>e.date),['2026-11-30','2026-12-30','2027-01-30']);assert.equal(rows.find(e=>e.id==='existing-fixed').amount,123.45);assert.ok(rows.filter(e=>e.recurrenceId).every(e=>e.pro==='pA'));assert.equal(rows.find(e=>e.id==='unrelated').amount,9);w.close();
});
test('série de gastos é enviada de uma vez e clique duplicado espera a confirmação do servidor',async()=>{
 let reply,started;const sent=new Promise(r=>started=r),requests=[];
 const dom=await financeScheduleApp({setup(w){w.__OLHAN_CLOUD__={revision:7,data:null,role:'admin'};},fetcher:async(url,options)=>{if(url==='/api/workspace'){requests.push(JSON.parse(options.body));started();return new Promise(resolve=>reply=resolve);}return {ok:true,json:async()=>({configured:true})};}}),w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));
 const f=repeatCash(w,fillCash(w,{date:'2026-12-31'}),'2027-02');submitForm(w,f);submitForm(w,f);await sent;assert.equal(requests.length,1);assert.deepEqual(requests[0].data.cashEntries.map(e=>e.date),['2026-12-31','2027-01-31','2027-02-28']);assert.equal(f.querySelector('[type="submit"]').disabled,true);
 reply({ok:true,json:async()=>({revision:8})});await w.OlhanCloud.flush();await tick();assert.equal(w.eval('db.cashEntries.length'),3);assert.equal(w.document.getElementById('modal').open,false);w.close();
});
test('falha de servidor na série conserva a revisão sem repetir despesas ao tentar de novo',async()=>{
 let posts=0;const dom=await financeScheduleApp({setup(w){w.__OLHAN_CLOUD__={revision:7,data:null,role:'admin'};},fetcher:async(url)=>{if(url==='/api/workspace')posts++;return {ok:url!=='/api/workspace',json:async()=>url==='/api/workspace'?{error:'Falha de servidor'}:{configured:true}};}}),w=dom.window;w.eval(fs.readFileSync(path.join(root,'cloud.js'),'utf8'));
 const f=repeatCash(w,fillCash(w),'2027-02');submitForm(w,f);await tick();await tick();assert.equal(w.document.getElementById('modal').open,true);assert.equal(w.eval('db.cashEntries.length'),3);assert.match(f.querySelector('#cash-save-status').textContent,/sem confirmação/);f.elements.repeatUntil.value='2027-03';submitForm(w,f);await tick();assert.equal(w.eval('db.cashEntries.length'),3);assert.equal(posts,1);w.close();
});
