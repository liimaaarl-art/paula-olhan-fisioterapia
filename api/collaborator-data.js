import { randomUUID } from 'node:crypto';
import { collaboratorSession } from '../lib/collaborator-auth.js';
import { projectCollaboratorWorkspace, applyCollaboratorAction } from '../lib/collaborator-access.mjs';
import { db, json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';

export function handlerFactory({sqlFactory=db,session=collaboratorSession,makeId=randomUUID,now=()=>new Date().toISOString()}={}) {
 return async function handler(req,res) {
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
