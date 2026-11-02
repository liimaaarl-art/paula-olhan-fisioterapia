import { db } from '../lib/db.js';
import { adminSession } from '../lib/auth.js';
import { incomingHeaders } from '../lib/auth-guard.js';
import { makePatientHandler } from '../lib/patient-service.js';
import { patientMayReadFile } from '../lib/patient-portal.js';
import { r2Config } from '../lib/r2.js';
import { signedMediaUrl } from '../lib/media-sign.js';
export default async function handler(req,res){return makePatientHandler({sqlFactory:db,secret:process.env.BETTER_AUTH_SECRET,production:process.env.VERCEL_ENV==='production',getAdmin:async req=>adminSession(incomingHeaders(req)),fileUrl:async(sql,id,s)=>{
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return null;
 const r=await sql`SELECT id,patient_id,object_key,name,mime FROM public.olhan_cloud_files WHERE id=${id}::uuid UNION ALL SELECT id,patient_id,object_key,name,mime FROM public.olhan_cloud_files_large WHERE id=${id}::uuid AND ready`;
 const f=r[0];if(r.length!==1||!patientMayReadFile(s.data,{role:'patient',patientId:s.patient.id},f))return null;
 const cfg=r2Config();if(!cfg)throw Error('STORAGE_UNAVAILABLE');return signedMediaUrl(cfg,f.object_key,{seconds:f.mime.startsWith('video/')?900:120});
}})(req,res);}
