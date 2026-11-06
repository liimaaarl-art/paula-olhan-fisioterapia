import { randomUUID } from 'node:crypto';
import { collaboratorSession, ensureCollaboratorAccount } from '../lib/collaborator-auth.js';
import { projectCollaboratorWorkspace, applyCollaboratorAction, COLLABORATORS, normalizeEmail } from '../lib/collaborator-access.mjs';
import { getAuth, adminSession } from '../lib/auth.js';
import { incomingHeaders } from '../lib/auth-guard.js';
import { db, json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';

export function handlerFactory({sqlFactory=db,session=collaboratorSession,makeId=randomUUID,now=()=>new Date().toISOString()}={}) {
 return async function handler(req,res) {
  if(req.method==='POST'&&req.body?.action==='provision'){
   const admin=await adminSession(incomingHeaders(req));if(!admin)return json(res,401,{error:'Somente a administração pode cadastrar colaboradoras.'});
   if(!sameOrigin(req)||!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,403,{error:'Solicitação não autorizada.'});
   const email=normalizeEmail(req.body.email),person=COLLABORATORS[email];if(!person)return json(res,400,{error:'Colaboradora não autorizada para este cadastro.'});
   try{
    const sql=sqlFactory(),rows=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;
    if(!rows[0]?.data)return json(res,409,{error:'A Paula precisa abrir a base do consultório antes do cadastro.'});
    const auth=getAuth(),authCtx=await auth.$context,existing=await authCtx.internalAdapter.findUserByEmail(email);
    if(existing&&(existing.user.role==='admin'||existing.user.role==='support'))return json(res,409,{error:'Este e-mail está reservado a uma conta administrativa.'});
    const data=structuredClone(rows[0].data);if(!Array.isArray(data.team))return json(res,503,{error:'Cadastro da equipe indisponível.'});
    const matches=data.team.filter(t=>normalizeEmail(t.email)===email);
    if(matches.length>1)return json(res,409,{error:'Há cadastros duplicados para este e-mail. Revise a equipe antes de continuar.'});
    let member=matches[0];
    if(member&&member.role&&member.role!=='Fisioterapeuta colaboradora')return json(res,409,{error:'Este e-mail já está vinculado a outro perfil da equipe.'});
    if(!member){member={id:makeId(),name:person.name,email,role:person.title,active:true,permissions:[...person.permissions]};data.team.push(member);}
    else Object.assign(member,{name:person.name,email,role:person.title,active:true,permissions:[...person.permissions]});
    const saved=await sql`WITH changed AS (UPDATE public.olhan_workspace SET data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_by=${admin.user.id},updated_at=now() WHERE id='olhan' AND revision=${rows[0].revision} RETURNING revision) SELECT revision FROM changed`;
    if(!saved.length)return json(res,409,{error:'A base foi alterada em outra sessão. Atualize e tente novamente.'});
    await ensureCollaboratorAccount(auth,email);
    return json(res,200,{created:true,name:person.name,email,teamId:member.id,revision:saved[0].revision,activation:'/login.html'});
   }catch(error){return json(res,503,{error:error?.message==='RESERVED_ACCOUNT'?'O e-mail está reservado a outra função. Revise o cadastro.':'Não foi possível concluir o cadastro. Nenhuma senha foi enviada.'});}
  }
  let auth;try{auth=await session(req.headers);}catch{return json(res,503,{error:'Acesso temporariamente indisponível.'});}
  if(!auth)return json(res,401,{error:'Entre com sua conta de colaboradora.'});
  req.olhanUser=auth.user;
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method==='GET'){
   try{const rows=await sqlFactory()`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;if(!rows[0])return json(res,503,{error:'Dados indisponíveis.'});return json(res,200,projectCollaboratorWorkspace(rows[0],auth.user.email));}
   catch{return json(res,503,{error:'Não foi possível carregar os dados atribuídos a esta conta.'});}
  }
  if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
  if(!sameOrigin(req))return json(res,403,{error:'Origem não autorizada.'});
  if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
  const {revision,action,payload}=req.body||{};if(!Number.isSafeInteger(revision)||revision<1)return json(res,400,{error:'Versão inválida.'});
  try {
   const sql=sqlFactory();
   const rows=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;
   if(!rows[0]||rows[0].revision!==revision)return json(res,409,{error:'Os dados foram atualizados em outra sessão. Atualize a tela antes de salvar.',code:'REVISION_CONFLICT'});
   if(action==='file.register'){
    const fileId=payload?.file?.id,patientId=payload?.patient;
    const uploaded=await sql`SELECT id FROM public.olhan_cloud_files WHERE id=${fileId}::uuid AND patient_id=${patientId} AND uploaded_by=${auth.user.id} UNION ALL SELECT id FROM public.olhan_cloud_files_large WHERE id=${fileId}::uuid AND patient_id=${patientId} AND uploaded_by=${auth.user.id} AND ready LIMIT 1`;
    if(!uploaded.length)return json(res,404,{error:'Arquivo não autorizado para este paciente.'});
   }
   const next=applyCollaboratorAction(rows[0],auth.user.email,action,payload,makeId);
   const result=await sql`WITH changed AS (UPDATE public.olhan_workspace SET data=${JSON.stringify(next)}::jsonb,revision=revision+1,updated_by=${auth.user.id},updated_at=now() WHERE id='olhan' AND revision=${revision} RETURNING revision,data,updated_by), archived AS (INSERT INTO public.olhan_workspace_history(revision,data,updated_by) SELECT revision,data,updated_by FROM changed RETURNING revision) SELECT revision FROM archived`;
   if(!result.length)return json(res,409,{error:'Outra sessão atualizou os dados. Atualize e tente novamente.',code:'REVISION_CONFLICT'});
   return json(res,200,{revision:result[0].revision});
  }catch(e){return json(res,400,{error:e?.message||'Não foi possível salvar.'});}
 };
}
export default handlerFactory();
