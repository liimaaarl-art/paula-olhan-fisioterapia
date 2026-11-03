// Public, isolated preview. These credentials open sample content only.
// This module never calls the patient API, database, or private storage.
(() => {
 'use strict';
 let signedIn=false;
 const dateIn=days=>{const d=new Date();d.setDate(d.getDate()+days);return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(d);};
 const sample={
  name:'Paula Olhan',
  media:[
   {id:'demo-photo',name:'Foto de exemplo · acolhimento',type:'image/jpeg',date:dateIn(0)},
   {id:'demo-video',name:'Vídeo de exemplo',type:'video/mp4',date:dateIn(0)},
   {id:'demo-document',name:'Relatório de exemplo.pdf',type:'application/pdf',date:dateIn(0)}
  ],
  records:[{type:'Registro de exemplo',date:dateIn(0),fields:[
   {label:'Conduta',text:'Atividade funcional com exercícios de mobilidade e coordenação.'},
   {label:'Resposta ao atendimento',text:'Registro ilustrativo de sessão concluída.'}
  ]}],
  appointments:[{date:dateIn(7),time:'09:00',status:'Exemplo de agendamento'}]
 };
 const files={'demo-photo':'/patient-demo-foto.jpg','demo-video':'/patient-demo-video.mp4','demo-document':'/patient-demo-documento.pdf'};
 window.OlhanPatientDemo={async request(body,query=''){
  if(body?.action==='login'){
   if(String(body.cpf||'').trim().toLowerCase()!=='admin'||body.password!=='olhan')throw Error('Usuário ou senha incorretos. Na demonstração, use admin e olhan.');
   signedIn=true;return {ok:true};
  }
  if(body?.action==='logout'){signedIn=false;return {ok:true};}
  if(!signedIn)throw Error('Entre na demonstração.');
  if(body)throw Error('Esta demonstração permite apenas visualizar o conteúdo de exemplo.');
  const params=new URLSearchParams(query.replace(/^\?/,''));
  if(params.get('action')==='file'){
   const url=files[params.get('id')];if(!url)throw Error('Arquivo de exemplo não encontrado.');return {url};
  }
  return JSON.parse(JSON.stringify(sample));
 }};
})();
