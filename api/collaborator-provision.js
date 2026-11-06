import { randomUUID } from 'node:crypto';
import { getAuth } from '../lib/auth.js';
import { adminSession } from '../lib/auth.js';
import { ensureCollaboratorAccount } from '../lib/collaborator-auth.js';
import { COLLABORATORS, normalizeEmail } from '../lib/collaborator-access.mjs';
import { incomingHeaders } from '../lib/auth-guard.js';
import { db,json } from '../lib/db.js';
import { sameOrigin } from '../lib/ai-session.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 const admin=await adminSession(incomingHeaders(req));if(!admin)return json(res,401,{error:'Somente a administração pode cadastrar colaboradoras.'});
 if(req.method!=='POST')return json(res,405,{error:'Método não permitido.'});
 if(!sameOrigin(req)||!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,403,{error:'Solicitação não autorizada.'});
 const email=normalizeEmail(req.body?.email);const person=COLLABORATORS[email];if(!person)return json(res,400,{error:'Colaboradora não autorizada para este cadastro.'});
 try{
  const sql=db();const rows=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;if(!rows[0]?.data)return json(res,409,{error:'A Paula precisa abrir a base do consultório antes do cadastro.'});
  const auth=getAuth(),authCtx=await auth.$context,existing=await authCtx.internalAdapter.findUserByEmail(email);if(existing&&(existing.user.role==='admin'||existing.user.role==='support'))return json(res,409,{error:'Este e-mail está reservado a uma conta administrativa.'});
  const data=structuredClone(rows[0].data);if(!Array.isArray(data.team))return json(res,503,{error:'Cadastro da equipe indisponível.'});
  const matches=data.team.filter(t=>normalizeEmail(t.email)===email);if(matches.length>1)return json(res,409,{error:'Há cadastros duplicados para este e-mail. Revise a equipe antes de continuar.'});
  let member=matches[0];if(member&&member.role&&member.role!=='Fisioterapeuta colaboradora')return json(res,409,{error:'Este e-mail já está vinculado a outro perfil da equipe.'});
  if(!member){member={id:randomUUID(),name:person.name,email,role:person.title,active:true,permissions:[...person.permissions]};data.team.push(member);}
  else Object.assign(member,{name:person.name,email,role:person.title,active:true,permissions:[...person.permissions]});
  const saved=await sql`WITH changed AS (UPDATE public.olhan_workspace SET data=${JSON.stringify(data)}::jsonb,revision=revision+1,updated_by=${admin.user.id},updated_at=now() WHERE id='olhan' AND revision=${rows[0].revision} RETURNING revision) SELECT revision FROM changed`;
  if(!saved.length)return json(res,409,{error:'A base foi alterada em outra sessão. Atualize e tente novamente.'});
  await ensureCollaboratorAccount(auth,email);
  return json(res,200,{created:true,name:person.name,email,teamId:member.id,revision:saved[0].revision,activation:'/login.html'});
 }catch(error){return json(res,503,{error:error?.message==='RESERVED_ACCOUNT'?'O e-mail está reservado a outra função. Revise o cadastro.':'Não foi possível concluir o cadastro. Nenhuma senha foi enviada.'});}
}
