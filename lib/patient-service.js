import { normalizeCpf, patientAccessEligibility } from './patient-identity.js';
import { newToken,tokenHash,identityKey,hashPassword,checkPassword,passwordValid,patientCookie,readPatientToken } from './patient-security.js';
import { liveWorkspace,syncPatientAccounts,allowAttempt,livePatient,patientSession } from './patient-store.js';
import { patientPortalView,patientAvatarId } from './patient-portal.js';
const fail='CPF, senha ou link inválido. Confira os dados ou peça ajuda à equipe.';
function reply(res,status,data){res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).end(JSON.stringify(data));}
function originOK(req){try{return new URL(req.headers?.origin).protocol==='https:'&&new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
export function makePatientHandler({sqlFactory,secret,getAdmin,fileUrl,production=true}){return async(req,res)=>{
 try{
  if(!secret||secret.length<32)return reply(res,503,{error:'Acesso temporariamente indisponível.'});
  if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Método não permitido.'});
  if(req.method==='POST'&&(!originOK(req)||!String(req.headers['content-type']||'').startsWith('application/json')))return reply(res,403,{error:'Solicitação não autorizada.'});
  const sql=sqlFactory(),action=req.method==='GET'?(req.query?.action||'session'):req.body?.action;
  if(req.method==='GET'){
   const session=await patientSession(sql,req,secret);
   if(!session)return reply(res,401,{error:'Entre na área do paciente.'});
   if(action==='session'){const view=patientPortalView(session.data,{role:'patient',patientId:session.patient.id});return reply(res,200,{...view,avatarFileId:patientAvatarId(view,session.account.avatar_file_id)});}
   if(action==='file'){const url=await fileUrl(sql,req.query?.id,session);return url?reply(res,200,{url}):reply(res,404,{error:'Arquivo não encontrado.'});}
   return reply(res,404,{error:'Operação não encontrada.'});
  }
  const b=req.body||{};
  if(action==='invite'){
   const admin=await getAdmin(req);if(!admin)return reply(res,401,{error:'Entre na conta da equipe.'});
   const data=await liveWorkspace(sql),p=data.patients.find(p=>p.id===b.patientId);
   if(patientAccessEligibility(p,data.patients)!=='eligible')return reply(res,400,{error:'Confira CPF válido, nascimento, situação ativa e ausência de CPF duplicado no cadastro.'});
   await syncPatientAccounts(sql,data,secret);
   const token=newToken();await sql`UPDATE public.olhan_patient_accounts SET invite_hash=${tokenHash(token)},invite_until=now()+interval '48 hours',updated_at=now() WHERE patient_id=${p.id} AND active`;
   const root=production?'https://olhan-fisioterapia-site.vercel.app/area-do-paciente.html':'https://'+req.headers.host+'/paciente.html';
   return reply(res,200,{url:root+'#ativar='+token,expiresHours:48});
  }
  if(action==='logout'){const t=readPatientToken(req);if(t)await sql`DELETE FROM public.olhan_patient_sessions WHERE token_hash=${tokenHash(t)}`;res.setHeader('Set-Cookie',patientCookie(''));return reply(res,200,{ok:true});}
  if(action==='set-avatar'){
   const s=await patientSession(sql,req,secret);if(!s)return reply(res,401,{error:'Entre novamente.'});
   if(!await allowAttempt(sql,'avatar:'+s.patient.id,secret,20))return reply(res,429,{error:'Aguarde 15 minutos.'});
   const view=patientPortalView(s.data,{role:'patient',patientId:s.patient.id}),id=b.fileId===null?null:patientAvatarId(view,b.fileId);
   if(b.fileId!==null&&(!id||!await fileUrl(sql,id,s)))return reply(res,404,{error:'Foto não encontrada no seu cadastro.'});
   const updated=await sql`UPDATE public.olhan_patient_accounts SET avatar_file_id=${id}::uuid,updated_at=now() WHERE patient_id=${s.patient.id} AND active AND epoch=${s.account.epoch} RETURNING patient_id`;
   return updated.length?reply(res,200,{ok:true,avatarFileId:id}):reply(res,409,{error:'A conta foi alterada. Entre novamente.'});
  }
  if(!['login','activate','change-password'].includes(action))return reply(res,404,{error:'Operação não encontrada.'});
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').slice(0,200);
  if(!await allowAttempt(sql,'ip:'+ip,secret,40))return reply(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
  const cpf=normalizeCpf(b.cpf);
  if(action==='change-password'){
   const s=await patientSession(sql,req,secret);if(!s)return reply(res,401,{error:'Entre novamente.'});
   if(!await allowAttempt(sql,'change:'+s.patient.id,secret,5))return reply(res,429,{error:'Aguarde 15 minutos.'});
   if(!passwordValid(b.newPassword)||!await checkPassword(b.currentPassword,s.account.password_hash))return reply(res,400,{error:'Senha atual incorreta ou nova senha com menos de 12 caracteres.'});
   const hash=await hashPassword(b.newPassword);const updated=await sql`UPDATE public.olhan_patient_accounts SET password_hash=${hash},epoch=epoch+1,invite_hash=NULL WHERE patient_id=${s.patient.id} AND epoch=${s.account.epoch} AND active RETURNING patient_id`;
   if(!updated.length)return reply(res,409,{error:'A conta foi alterada. Entre novamente.'});
   res.setHeader('Set-Cookie',patientCookie(''));return reply(res,200,{ok:true});
  }
  const key=cpf?identityKey(cpf,secret):'invalid';
  if(!await allowAttempt(sql,'cpf:'+key,secret,8))return reply(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
  const rows=await sql`SELECT * FROM public.olhan_patient_accounts WHERE cpf_key=${key} AND active`;
  const account=rows[0],data=await liveWorkspace(sql),patient=livePatient(data,account,secret);
  if(action==='activate'){
   if(!patient||typeof b.token!=='string'||!/^[-\w]{43}$/.test(b.token)||account.invite_hash!==tokenHash(b.token)||!account.invite_until||new Date(account.invite_until)<=new Date()||b.birth!==patient.birth||!passwordValid(b.password))return reply(res,400,{error:fail+' A senha deve ter pelo menos 12 caracteres.'});
   const hash=await hashPassword(b.password);
   const changed=await sql`UPDATE public.olhan_patient_accounts SET password_hash=${hash},epoch=epoch+1,invite_hash=NULL,invite_until=NULL WHERE patient_id=${patient.id} AND active AND invite_hash=${tokenHash(b.token)} AND invite_until>now() AND epoch=${account.epoch} RETURNING epoch`;
   if(!changed.length)return reply(res,400,{error:fail});
   return reply(res,200,{ok:true,message:'Senha criada. Entre com CPF e sua nova senha.'});
  }
  const valid=await checkPassword(b.password,patient?account.password_hash:null);
  if(!patient||!valid)return reply(res,401,{error:fail});
  const token=newToken();const added=await sql`INSERT INTO public.olhan_patient_sessions(token_hash,patient_id,epoch,expires_at) SELECT ${tokenHash(token)},patient_id,epoch,now()+interval '8 hours' FROM public.olhan_patient_accounts WHERE patient_id=${patient.id} AND active AND epoch=${account.epoch} AND password_hash=${account.password_hash} RETURNING patient_id`;
  if(!added.length)return reply(res,401,{error:fail});res.setHeader('Set-Cookie',patientCookie(token));return reply(res,200,{ok:true});
 }catch{return reply(res,503,{error:'Acesso temporariamente indisponível. Tente novamente.'});}
};}
