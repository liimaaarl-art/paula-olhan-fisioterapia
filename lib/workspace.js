import { db } from './db.js';
export const MAX_STATE_BYTES = 3000000;
export function emptyWorkspace() {
 return {patients:[],team:[],appointments:[],records:[],invoices:[],files:[]};
}
export function validateState(data) {
 if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('Dados inválidos.');
 for (const key of ['patients','team','appointments','records','invoices','files']) {
  if (!Array.isArray(data[key])) throw Error('Backup incompleto: '+key);
 }
 if (Buffer.byteLength(JSON.stringify(data))>MAX_STATE_BYTES) throw Error('Dados acima do limite. Migre os anexos antes de salvar.');
 for (const file of data.files) {
  if (!file || typeof file.id!=='string' || !data.patients.some(p=>p.id===file.patient)) throw Error('Anexo sem paciente válido.');
  if (file.data !== '/api/files?id='+(file.cloudId||file.id)) throw Error('Anexe os arquivos ao servidor antes de salvar.');
 }
 return data;
}
export async function workspace(sql=db()) {
 const rows=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;
 return rows[0] || {revision:0,data:null};
}
