import { randomBytes, createHash, createHmac, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(rawScrypt);
export const PATIENT_COOKIE='__Host-olhan-patient';
export const newToken=()=>randomBytes(32).toString('base64url');
export const tokenHash=t=>createHash('sha256').update(String(t)).digest('hex');
export const identityKey=(cpf,secret)=>createHmac('sha256',secret).update('patient-cpf:'+cpf).digest('hex');
export const rateKey=(value,secret)=>createHmac('sha256',secret).update('patient-rate:'+value).digest('hex');
export function passwordValid(p){return typeof p==='string'&&p.length>=12&&p.length<=128;}
export async function hashPassword(p){if(!passwordValid(p))throw Error('Use uma senha de 12 a 128 caracteres.');const salt=randomBytes(16).toString('hex');const key=await scrypt(p,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return 's1:'+salt+':'+key.toString('hex');}
export async function checkPassword(p,stored){const parts=String(stored||'').split(':');const valid=parts.length===3&&parts[0]==='s1'&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2]);const key=await scrypt(typeof p==='string'?p.slice(0,128):'',valid?parts[1]:'0'.repeat(32),64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return valid&&timingSafeEqual(key,Buffer.from(parts[2],'hex'));}
export function readPatientToken(req){const t=String(req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(PATIENT_COOKIE+'='))?.slice(PATIENT_COOKIE.length+1);return /^[\w-]{43}$/.test(t||'')?t:null;}
export const patientCookie=t=>`${PATIENT_COOKIE}=${t||''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${t?28800:0}`;
