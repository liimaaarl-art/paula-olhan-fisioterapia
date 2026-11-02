import { normalizeCpf, patientAccessEligibility } from './patient-identity.js';
import { identityKey, tokenHash, readPatientToken, rateKey } from './patient-security.js';
export async function liveWorkspace(sql){const r=await sql`SELECT data FROM public.olhan_workspace WHERE id='olhan'`;return r[0]?.data||{patients:[],files:[],records:[],appointments:[]};}
export async function syncPatientAccounts(sql,data,secret){
 const eligible=data.patients.filter(p=>patientAccessEligibility(p,data.patients)==='eligible');
 const rows=eligible.map(p=>({patient_id:p.id,cpf_key:identityKey(normalizeCpf(p.cpf),secret)}));
 // Disable first if a CPF was transferred between records. Inactive identities
 // retain a unique reserved key; live-workspace checks also run on every request.
 await sql`UPDATE public.olhan_patient_accounts a SET active=false,cpf_key='inactive:'||a.patient_id,password_hash=NULL,invite_hash=NULL,epoch=epoch+1 WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(patient_id text,cpf_key text) WHERE x.patient_id=a.patient_id AND x.cpf_key=a.cpf_key)`;
 for(const row of rows){
  await sql`INSERT INTO public.olhan_patient_accounts(patient_id,cpf_key) VALUES(${row.patient_id},${row.cpf_key}) ON CONFLICT(patient_id) DO UPDATE SET active=true,password_hash=CASE WHEN olhan_patient_accounts.cpf_key=EXCLUDED.cpf_key THEN olhan_patient_accounts.password_hash ELSE NULL END,epoch=olhan_patient_accounts.epoch+CASE WHEN olhan_patient_accounts.cpf_key=EXCLUDED.cpf_key AND olhan_patient_accounts.active THEN 0 ELSE 1 END,invite_hash=CASE WHEN olhan_patient_accounts.cpf_key=EXCLUDED.cpf_key AND olhan_patient_accounts.active THEN olhan_patient_accounts.invite_hash ELSE NULL END,cpf_key=EXCLUDED.cpf_key,updated_at=now()`;
 }
}
export async function allowAttempt(sql,value,secret,max=8){const key=rateKey(value,secret);const r=await sql`INSERT INTO public.olhan_patient_rates(key,hits,expires_at) VALUES(${key},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN olhan_patient_rates.expires_at<=now() THEN 1 ELSE olhan_patient_rates.hits+1 END,expires_at=CASE WHEN olhan_patient_rates.expires_at<=now() THEN now()+interval '15 minutes' ELSE olhan_patient_rates.expires_at END RETURNING hits`;return r[0].hits<=max;}
export function livePatient(data,account,secret){if(!account?.active)return null;const p=data.patients.find(p=>p.id===account.patient_id);return p&&patientAccessEligibility(p,data.patients)==='eligible'&&identityKey(normalizeCpf(p.cpf),secret)===account.cpf_key?p:null;}
export async function patientSession(sql,req,secret){const t=readPatientToken(req);if(!t)return null;const r=await sql`SELECT a.* FROM public.olhan_patient_sessions s JOIN public.olhan_patient_accounts a ON a.patient_id=s.patient_id WHERE s.token_hash=${tokenHash(t)} AND s.expires_at>now() AND s.epoch=a.epoch AND a.active`;if(!r.length)return null;const data=await liveWorkspace(sql);const patient=livePatient(data,r[0],secret);return patient?{account:r[0],patient,data}:null;}
