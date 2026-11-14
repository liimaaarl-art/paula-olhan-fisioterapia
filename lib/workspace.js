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
 if(data.recycleBin!==undefined&&!Array.isArray(data.recycleBin))throw Error('Lixeira inválida.');
 const trashIds=new Set();
 for(const item of data.recycleBin||[]){
  if(!item||typeof item.id!=='string'||trashIds.has(item.id))throw Error('Item inválido na lixeira.');
  trashIds.add(item.id);
  if(item.kind==='patient'){
   if(typeof item.patient?.id!=='string'||data.patients.some(p=>p.id===item.patient.id))throw Error('Cadastro duplicado entre pacientes e lixeira.');
  }else if(item.kind==='appointments'){
   if(!Array.isArray(item.items)||!item.items.length||item.items.some(a=>typeof a?.id!=='string'||data.appointments.some(x=>x.id===a.id)))throw Error('Agendamento inválido ou duplicado na lixeira.');
  }else throw Error('Tipo inválido na lixeira.');
 }
 if (Buffer.byteLength(JSON.stringify(data))>MAX_STATE_BYTES) throw Error('Dados acima do limite. Migre os anexos antes de salvar.');
 for (const file of data.files) {
  if (!file || typeof file.id!=='string' || !(data.patients.some(p=>p.id===file.patient)||(data.recycleBin||[]).some(i=>i.kind==='patient'&&i.patient?.id===file.patient))) throw Error('Anexo sem paciente válido.');
  if (file.data !== '/api/files?id='+(file.cloudId||file.id)) throw Error('Anexe os arquivos ao servidor antes de salvar.');
 }
 return data;
}
export async function workspace(sql=db()) {
 const rows=await sql`SELECT revision,data FROM public.olhan_workspace WHERE id='olhan'`;
 return rows[0] || {revision:0,data:null};
}
