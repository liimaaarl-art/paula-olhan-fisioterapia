import { protect } from '../lib/auth-guard.js';
import { generateText, Output, transcribe } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { json } from '../lib/db.js';
import { authorized,audioFromBody,validateText,evolutionSchema,assistantSchema,extractionPrompt,assistantPrompt } from '../lib/ai-policy.js';

import {sessionAuthorized,sameOrigin} from '../lib/ai-session.js';
export const maxDuration=120;
const rates=new Map();
export async function handler(req,res){
  const configured=!!(process.env.GROQ_API_KEY&&process.env.OLHAN_AI_ACCESS_CODE);
  if(req.method==='GET')return json(res,200,{configured,connected:configured&&sessionAuthorized(req,process.env.OLHAN_AI_ACCESS_CODE),provider:'Groq',maxAudioBytes:2500000});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return json(res,405,{error:'Método não permitido.'});}
  if(!configured)return json(res,503,{error:'A IA aguarda configuração no servidor. Os demais recursos do sistema continuam disponíveis.',code:'AI_NOT_CONFIGURED'});
  const bearer=authorized(req,process.env.OLHAN_AI_ACCESS_CODE);
  if(!bearer&&!sessionAuthorized(req,process.env.OLHAN_AI_ACCESS_CODE))return json(res,401,{error:'Conecte a IA com o código de acesso definido para a Paula.'});
  if(!bearer&&!sameOrigin(req))return json(res,403,{error:'Origem não autorizada.'});
  const origin=req.headers?.origin;const host=req.headers?.host;
  try{if(origin&&new URL(origin).host!==host)return json(res,403,{error:'Origem não autorizada.'});}catch{return json(res,403,{error:'Origem inválida.'});}
  if(!String(req.headers?.['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Envie JSON.'});
  const now=Date.now(),ip=String(req.headers?.['x-forwarded-for']||'local').split(',')[0];
  for(const [k,v] of rates)if(v.until<=now)rates.delete(k);
  const rate=rates.get(ip)||{count:0,until:now+60000};if(++rate.count>12)return json(res,429,{error:'Aguarde um minuto antes de tentar novamente.'});rates.set(ip,rate);
  if(Number(req.headers?.['content-length']||0)>3600000)return json(res,413,{error:'Envie áudio de até 2,5 MB.'});
  const b=req.body||{};let mode=b.mode,text;
  if(!['assistant','evolution','transcribe','evolution-audio'].includes(mode))return json(res,400,{error:'Modo de IA inválido.'});
  let audio;
  try{if(mode==='transcribe'||mode==='evolution-audio')audio=audioFromBody(b);else text=validateText(b.text,mode==='assistant'?4000:16000);if(mode==='assistant'&&JSON.stringify(b.context||{}).length>100000)throw Error('Muitos dados no contexto. Use filtros ou um pedido mais específico.');}catch(e){return json(res,400,{error:e.message});}
  const groq=createGroq({apiKey:process.env.GROQ_API_KEY});
  try{
    if(audio){const result=await transcribe({model:groq.transcription(process.env.GROQ_TRANSCRIPTION_MODEL||'whisper-large-v3'),audio,providerOptions:{groq:{language:'pt'}},maxRetries:1,abortSignal:AbortSignal.timeout(45000)});text=validateText(result.text);if(mode==='transcribe')return json(res,200,{text});}
    const isAssistant=mode==='assistant';
    const result=await generateText({model:groq(process.env.GROQ_TEXT_MODEL||'openai/gpt-oss-120b'),system:isAssistant?assistantPrompt:extractionPrompt,prompt:isAssistant?JSON.stringify({context:b.context||{},request:text}):text,output:Output.object({schema:isAssistant?assistantSchema:evolutionSchema}),maxOutputTokens:4500,maxRetries:1,abortSignal:AbortSignal.timeout(45000)});
    return json(res,200,{...(isAssistant?{proposal:result.output}:{fields:result.output,text})});
  }catch(e){const status=e.statusCode===429?429:502;return json(res,status,{error:status===429?'A IA atingiu o limite de uso. Tente novamente mais tarde.':'A IA não conseguiu concluir. Seu texto e os dados do sistema foram preservados. Confira a configuração ou tente novamente.'});}
}

export default protect(handler);
