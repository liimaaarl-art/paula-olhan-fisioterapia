import '../deletion-core.js';
import { randomUUID } from 'node:crypto';
import { protect } from '../lib/auth-guard.js';
import { db, json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';
import { validateState } from '../lib/workspace.js';
import { syncPatientAccounts } from '../lib/patient-store.js';

export function deletionHandler({sqlFactory=db,makeId=randomUUID,now=()=>new Date().toISOString(),sync=syncPatientAccounts}={}){return async(req,res)=>{
 if(!req.olhanUser)return json(res,401,{error:'Entre na sua conta.'});
 if(!['admin','support'].includes(req.olhanUser.role))return json(res,403,{error:'Somente a administração pode excluir ou restaurar.'});
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 if(!sameOrigin(req))return json(res,403,{error:'Origem não autorizada.'});
 if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
 const {revision,kind,ref,scope,plan:reviewed}=req.body||{};
 if(!Number.isSafeInteger(revision)||revision<1||!reviewed)return json(res,400,{error:'Revise os itens antes de confirmar.'});
 try{
  const sql=sqlFactory(),rows=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;
  if(!rows[0]||rows[0].revision!==revision)return json(res,409,{error:'Os dados mudaram em outra sessão. Atualize a tela e revise novamente.',code:'REVISION_CONFLICT'});
  let data;try{
   const plan=globalThis.OlhanDeletionCore.prepare(rows[0].data,kind,ref,scope);
   if(!globalThis.OlhanDeletionCore.samePlan(plan,reviewed))return json(res,409,{error:'Os itens mudaram durante a revisão. Abra novamente e confira.'});
   data=validateState(globalThis.OlhanDeletionCore.apply(rows[0].data,plan,{makeId,now:now(),actor:req.olhanUser.id}));
  }catch(e){return json(res,400,{error:e.message});}
  const saved=await sql`WITH changed AS (UPDATE public.olhan_workspace SET data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_by=${req.olhanUser.id},updated_at=now() WHERE id='olhan' AND revision=${revision} RETURNING revision,data,updated_by), archived AS (INSERT INTO public.olhan_workspace_history(revision,data,updated_by) SELECT revision,data,updated_by FROM changed RETURNING revision) SELECT revision FROM archived`;
  if(!saved.length)return json(res,409,{error:'Outra sessão alterou os dados. Atualize e revise novamente.',code:'REVISION_CONFLICT'});
  let portalPending=false;
  if(kind==='patient'||(kind==='restore'&&reviewed.item?.kind==='patient'))try{await sync(sql,data,process.env.BETTER_AUTH_SECRET);}catch{portalPending=true;}
  return json(res,200,{revision:saved[0].revision,data,portalPending});
 }catch{return json(res,503,{error:'O servidor não confirmou a operação. Confira os dados antes de tentar novamente.'});}
};}
export default protect(deletionHandler());
