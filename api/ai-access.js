import { protect } from '../lib/auth-guard.js';
import {json} from '../lib/db.js';
import {issueSession,sessionCookie,sameOrigin,validCode} from '../lib/ai-session.js';
const attempts=new Map();
export async function handler(req,res){
 if(!['POST','DELETE'].includes(req.method)){res.setHeader('Allow','POST, DELETE');return json(res,405,{error:'Método não permitido.'});}
 if(!sameOrigin(req))return json(res,403,{error:'Origem não autorizada.'});
 if(req.method==='DELETE'){res.setHeader('Set-Cookie',sessionCookie(''));return json(res,200,{connected:false});}
 if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
 if(!process.env.GROQ_API_KEY||!process.env.OLHAN_AI_ACCESS_CODE)return json(res,503,{error:'Cadastre a chave Groq e o código de acesso no servidor para ativar a IA.'});
 const now=Date.now(),ip=String(req.headers?.['x-forwarded-for']||'local').split(',')[0];for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);
 const entry=attempts.get(ip)||{count:0,until:now+60000};attempts.set(ip,entry);if(++entry.count>8)return json(res,429,{error:'Aguarde um minuto antes de tentar conectar novamente.'});
 if(!validCode(req.body?.code,process.env.OLHAN_AI_ACCESS_CODE))return json(res,401,{error:'Código de acesso incorreto.'});
 res.setHeader('Set-Cookie',sessionCookie(issueSession(process.env.OLHAN_AI_ACCESS_CODE),req.body.remember!==false));return json(res,200,{connected:true});
}

export default protect(handler);
