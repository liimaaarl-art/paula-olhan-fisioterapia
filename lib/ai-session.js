import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const COOKIE='__Host-olhan-ai';
export const SESSION_SECONDS=30*24*60*60;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function sameOrigin(req){try{return new URL(req.headers?.origin).host===req.headers?.host;}catch{return false;}}
export function issueSession(secret,now=Date.now()){const payload=Math.floor(now/1000)+SESSION_SECONDS+'.'+randomBytes(24).toString('base64url');return payload+'.'+createHmac('sha256',secret).update('olhan-ai-session:'+payload).digest('base64url');}
export function sessionAuthorized(req,secret,now=Date.now()){
 if(!secret)return false;const raw=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 if(raw.length>256)return false;const [expiry,nonce,signature,...rest]=raw.split('.');if(rest.length||!/^\d{10}$/.test(expiry)||!/^[-\w]{32}$/.test(nonce||''))return false;
 const until=Number(expiry),current=Math.floor(now/1000);if(until<=current||until>current+SESSION_SECONDS)return false;
 return equal(signature,createHmac('sha256',secret).update('olhan-ai-session:'+expiry+'.'+nonce).digest('base64url'));
}
export function sessionCookie(value,remember=true){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict${!value?'; Max-Age=0':remember?'; Max-Age='+SESSION_SECONDS:''}`;}
export function validCode(value,expected){return value?.length<=256&&!!expected&&equal(value,expected);}
