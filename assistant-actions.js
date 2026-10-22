/* Validação local das propostas. A IA nunca recebe acesso direto ao banco. */
(() => {
  'use strict';
  const allowed={
    patient:['name','birth','responsible','phone','address','pro','frequency','price','cycle','due','status','cpf','responsibleCpf'],
    professional:['name','cpf','rg','address','crefito','maritalStatus','role','email','payMode','payValue','repasse'],
    appointment:['patient','pro','date','time','duration','price','service','status','notes','repeatWeeks'],
    evolution:['patient','appointment','date','pro','general','pa','fc','spo','pain','paFinal','fcFinal','spoFinal','painFinal','conduct','goal'],
    cash:['type','date','amount','description','category','patient','pro'],
    goal:['patient','title','description','targetDate'],plan:['patient','summary','nextReview'],
    exercise:['title','category','instructions','url'],assignment:['patient','exercise','instructions','until'],
    contract:[],invoice:[],navigate:['view']
  };
  const labels={patient:'Paciente',professional:'Profissional',appointment:'Atendimento',evolution:'Evolução para revisão',cash:'Lançamento de caixa',goal:'Meta',plan:'Plano de cuidado',exercise:'Exercício',assignment:'Orientação individual',contract:'Contrato',invoice:'Fechamento',navigate:'Abrir tela'};
  const day=v=>{try{return /^\d{4}-\d{2}-\d{2}$/.test(v||'')&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v}catch{return false}};
  const clone=o=>JSON.parse(JSON.stringify(o));
  const number=(v,label,min=0,max=Infinity)=>{const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<min||n>max)throw Error('Valor inválido em '+label+'.');return n;};
  function prepare(source,actions,options={}){
    if(!Array.isArray(actions)||!actions.length||actions.length>10)throw Error('Nenhuma ação válida para revisar.');
    const data=clone(source),changes=[],external=[];let schedule=null;
    data.care=data.care||{};for(const k of ['goals','exercises','assignments','audit'])data.care[k]=data.care[k]||[];data.care.plans=data.care.plans||{};
    const today=options.today||new Date().toISOString().slice(0,10),newId=options.id||(()=>crypto.randomUUID());
    const patient=id=>data.patients.find(x=>x.id===id),team=id=>data.team.find(x=>x.id===id);
    const requiredPatient=id=>{if(!patient(id))throw Error('Paciente não encontrado.');};
    for(const action of actions){
      const {entity,operation}=action;if(!allowed[entity]||!['create','update','open'].includes(operation))throw Error('Operação não permitida.');
      const f={};if(!Array.isArray(action.fields)||action.fields.length>30)throw Error('Campos inválidos.');
      for(const {key,value} of action.fields){if(!allowed[entity].includes(key)||Object.hasOwn(f,key)||typeof value!=='string'||value.length>6000)throw Error('Campo não permitido: '+key);f[key]=value.trim();}
      if(['navigate','contract','invoice'].includes(entity)){
        if(operation!=='open')throw Error('Abra a tela para revisar contratos ou fechamentos.');
        if(entity==='navigate'&&!['home','agenda','patients','records','evaluations','finance','team','reports','contracts','care-pending','care-exercises','care-follow','settings'].includes(f.view))throw Error('Tela inválida.');
        if(action.id&&entity==='contract'&&!data.contracts.some(x=>x.id===action.id))throw Error('Contrato não encontrado.');
        if(action.id&&entity==='invoice'&&!data.invoices.some(x=>x.id===action.id))throw Error('Fechamento não encontrado.');
        external.push({...action,values:f});changes.push({label:labels[entity],operation,fields:f});continue;
      }
      if(operation==='open')throw Error('Use inclusão ou alteração para esta entidade.');
      if(entity==='evolution'){
        if(operation!=='create')throw Error('Registros clínicos existentes devem ser revisados no prontuário.');
        requiredPatient(f.patient);const a=f.appointment&&data.appointments.find(x=>x.id===f.appointment);
        if(f.appointment&&(!a||a.patient!==f.patient||a.status.includes('Cancelado')||a.date>today))throw Error('Atendimento inválido para evolução.');
        if(!f.general)throw Error('Informe a evolução relatada.');external.push({...action,values:f});changes.push({label:labels[entity],operation:'open',fields:f});continue;
      }
      if(entity==='appointment'&&operation==='update'){
        if(actions.length!==1)throw Error('Revise cada alteração de agenda separadamente para escolher a recorrência.');
        if(Object.hasOwn(f,'repeatWeeks'))throw Error('Para mudar uma recorrência existente, escolha o alcance na confirmação.');
        OlhanSchedule.prepare(data,action.id,f,'once',{today});schedule={aid:action.id,patch:f};changes.push({label:labels[entity],operation,fields:f});continue;
      }
      const listName={patient:'patients',professional:'team',appointment:'appointments',cash:'cashEntries',goal:'goals',exercise:'exercises',assignment:'assignments'}[entity];
      const list=['goal','exercise','assignment'].includes(entity)?data.care[listName]:data[listName];
      if(entity==='plan'){
        requiredPatient(f.patient);for(const key of ['nextReview'])if(f[key]&&!day(f[key]))throw Error('Data de reavaliação inválida.');
        const old=data.care.plans[f.patient]||{};data.care.plans[f.patient]={...old,...f,updated:new Date().toISOString()};changes.push({label:labels[entity],operation,fields:f});continue;
      }
      if(!list)throw Error('Dados indisponíveis.');
      let current=operation==='update'?list.find(x=>x.id===action.id):null;if(operation==='update'&&!current)throw Error('Registro para alteração não encontrado.');
      const value={...(current||{}),...f};
      if(entity==='patient'){
        if(!value.name||!team(value.pro))throw Error('Informe nome e profissional do paciente.');
        if(value.birth&&(!day(value.birth)||value.birth>today))throw Error('Nascimento inválido.');
        value.price=number(value.price??0,'valor da sessão');value.due=number(value.due??10,'vencimento',1,28);if(!Number.isInteger(value.due))throw Error('Dia de vencimento deve ser inteiro.');
        value.cycle=value.cycle||'Mensal';if(!['Semanal','Quinzenal','Mensal'].includes(value.cycle))throw Error('Periodicidade inválida.');
        value.status=value.status||'Ativo';if(!['Ativo','Suspenso','Encerrado'].includes(value.status))throw Error('Situação de paciente inválida.');
      }
      if(entity==='professional'){
        if(!value.name)throw Error('Nome da profissional obrigatório.');value.payMode=value.payMode||'manual';if(!['manual','fixed','percent'].includes(value.payMode))throw Error('Regra de remuneração inválida.');
        value.payValue=number(value.payValue??0,'remuneração',0,value.payMode==='percent'?100:Infinity);value.repasse=number(value.repasse??0,'percentual',0,100);value.role=value.role||'Fisioterapeuta';
      }
      if(entity==='appointment'){
        requiredPatient(value.patient);if(!team(value.pro)||!day(value.date)||!OlhanSchedule.clock(value.time))throw Error('Confira profissional, data e horário.');
        value.duration=number(value.duration??60,'duração',15,480);value.price=number(value.price??patient(value.patient).price??0,'valor');if(!Number.isInteger(value.duration))throw Error('Duração deve ser inteira.');
        value.status=value.status||'Agendado';if(!['Agendado','Remarcado'].includes(value.status))throw Error('Novas sessões pelo assistente devem ficar agendadas ou remarcadas.');
        value.service=value.service||'Fisioterapia domiciliar';
        const count=number(value.repeatWeeks||1,'semanas',1,52);if(!Number.isInteger(count))throw Error('Quantidade de semanas deve ser inteira.');delete value.repeatWeeks;
        const seriesId=count>1?newId():null;
        for(let n=0;n<count;n++){
          const next={...value,id:newId(),date:new Date(Date.parse(value.date+'T12:00:00Z')+n*7*864e5).toISOString().slice(0,10),seriesId,history:[]};next.recurrenceSlot=OlhanSchedule.slot(next);
          data.appointments.push(next);
          // Valida toda a agenda provisória, inclusive conflitos entre novas sessões.
          OlhanSchedule.prepare(data,next.id,{},'once',{today});
        }
        changes.push({label:labels[entity],operation,fields:{...f,sessoes:String(count)}});continue;
      }
      if(entity==='cash'){
        if(current?.appointmentIds?.length||value.category==='Pagamento equipe')throw Error('Registre ou confira repasses na tela Financeiro.');
        if(!['entrada','saida'].includes(value.type)||!day(value.date))throw Error('Tipo ou data do caixa inválido.');value.amount=number(value.amount,'valor',.01);
        if(value.patient)requiredPatient(value.patient);if(value.pro&&!team(value.pro))throw Error('Profissional não encontrado.');
        if(!value.description)throw Error('Descreva o lançamento.');
        if(!current&&data.cashEntries.some(x=>x.type===value.type&&x.date===value.date&&Number(x.amount)===value.amount&&x.description===value.description))throw Error('Já existe um lançamento igual. Confira o Financeiro.');
      }
      if(['goal','assignment'].includes(entity))requiredPatient(value.patient);
      if(entity==='goal'){if(!value.title)throw Error('Informe a meta.');if(value.targetDate&&!day(value.targetDate))throw Error('Prazo inválido.');}
      if(entity==='exercise'){if(!value.title)throw Error('Informe o exercício.');if(value.url){let u;try{u=new URL(value.url)}catch{throw Error('Link inválido.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Use link HTTPS sem credenciais.');}}
      if(entity==='assignment'){if(!data.care.exercises.some(x=>x.id===value.exercise&&!x.archived))throw Error('Exercício indisponível.');if(value.until&&!day(value.until))throw Error('Data de revisão inválida.');value.active=true;}
      value.updated=new Date().toISOString();if(current)Object.assign(current,value);else list.push({...value,id:newId(),created:value.updated});changes.push({label:labels[entity],operation,fields:f});
    }
    if(external.length&&actions.length>1)throw Error('Abra cada formulário separadamente para preservar a revisão.');
    if(options.limits){
      const seeds=new Set(['p1','p2','p3','p4']);
      if(data.patients.length>source.patients.length&&data.patients.filter(p=>!seeds.has(p.id)).length>(options.limits.newPatients??Infinity))throw Error('Limite de novos pacientes da demonstração atingido.');
      if(data.cashEntries.length>source.cashEntries.length&&data.cashEntries.length+data.invoices.length>(options.limits.financialRecords??Infinity))throw Error('Limite de registros financeiros da demonstração atingido.');
    }
    return {data,changes,external,schedule};
  }
  window.OlhanAssistantCore={prepare,allowed,labels};
})();
