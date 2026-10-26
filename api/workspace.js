import { protect } from '../lib/auth-guard.js';
import { db, json } from '../lib/db.js';
import { workspace, validateState } from '../lib/workspace.js';
import { sameOrigin } from '../lib/ai-session.js';
export function workspaceHandler(sqlFactory=db) { return async (req,res)=>{
 if(!req.olhanUser)return json(res,401,{error:'Entre na sua conta.'});
 if(req.method==='GET'){try{return json(res,200,await workspace(sqlFactory()));}catch{return json(res,503,{error:'Não foi possível carregar os dados do servidor.'});}}
 if(req.method!=='PUT')return json(res,405,{error:'Método não permitido.'});
 if(!sameOrigin(req))return json(res,403,{error:'Origem não autorizada.'});
 if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
 let data,revision;try{data=validateState(req.body?.data);revision=req.body?.revision;if(!Number.isSafeInteger(revision)||revision<0)throw Error('Versão inválida.');}catch(e){return json(res,400,{error:e.message});}
 if(revision===0 && req.olhanUser.role!=='admin')return json(res,403,{error:'A Paula precisa iniciar a migração dos dados.'});
 try {
  const sql=sqlFactory();
  // One atomic compare-and-swap. Stale tabs never overwrite newer data.
  const result=await sql`WITH changed AS (
   INSERT INTO public.olhan_workspace(id,revision,data,updated_by)
   SELECT 'olhan',1,${JSON.stringify(data)}::jsonb,${req.olhanUser.id} WHERE ${revision}=0
   ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,revision=olhan_workspace.revision+1,updated_by=EXCLUDED.updated_by,updated_at=now()
   WHERE olhan_workspace.revision=${revision}
   RETURNING revision,data,updated_by
  ), updated AS (
   UPDATE public.olhan_workspace SET data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_by=${req.olhanUser.id},updated_at=now()
   WHERE id='olhan' AND revision=${revision} AND ${revision}>0
   RETURNING revision,data,updated_by
  ), all_changes AS (SELECT * FROM changed UNION ALL SELECT * FROM updated), archived AS (
   INSERT INTO public.olhan_workspace_history(revision,data,updated_by) SELECT revision,data,updated_by FROM all_changes RETURNING revision
  ) SELECT revision FROM archived`;
  if(!result.length)return json(res,409,{error:'Outra sessão alterou os dados. Exporte suas alterações pendentes antes de recarregar.',code:'REVISION_CONFLICT'});
  return json(res,200,{revision:result[0].revision});
 }catch{return json(res,503,{error:'O servidor não confirmou o salvamento. Suas alterações continuam nesta tela.'});}
};}
export default protect(workspaceHandler());
