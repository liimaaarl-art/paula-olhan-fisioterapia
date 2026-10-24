import { protect } from '../lib/auth-guard.js';
import { db, json } from '../lib/db.js';
export async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{ok:false,error:'Método não permitido'});
  try { const sql=db(); const rows=await sql`select current_database() as database, now() as server_time`; return json(res,200,{ok:true,database:rows[0].database,serverTime:rows[0].server_time}); }
  catch(e){ console.error('health db error',e); return json(res,500,{ok:false,error:'Falha ao conectar ao banco'}); }
}

export default protect(handler);
