import { db, json } from '../lib/db.js';
const allowed=new Set(['patient','team']);
export default async function handler(req,res){
  try {
    const sql=db();
    if(req.method==='GET'){
      const rows=await sql`select id,template_key,contract_type,title,version,content,is_current,created_at,updated_at from contract_templates order by template_key,version desc`;
      return json(res,200,{templates:rows});
    }
    if(req.method!=='POST') return json(res,405,{error:'Método não permitido'});
    const b=req.body||{};
    if(b.action!=='new-version'||!allowed.has(b.contract_type)||!String(b.title||'').trim()||!String(b.content||'').trim()) return json(res,400,{error:'Dados inválidos'});
    return json(res,403,{error:'Edição online bloqueada nesta fase de teste sem autenticação'});
  } catch(e){ console.error('contracts error',e); return json(res,500,{error:'Falha no servidor'}); }
}
