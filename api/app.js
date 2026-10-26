import { readFile } from 'node:fs/promises';
import { workspace } from '../lib/workspace.js';
import { adminSession } from '../lib/auth.js';
import { incomingHeaders } from '../lib/auth-guard.js';

let source;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  if (!['GET','HEAD'].includes(req.method)) { res.status(405); return res.end(); }
  try {
    const session = await adminSession(incomingHeaders(req));
    if (!session) { res.status(302); res.setHeader('Location', '/login.html'); return res.end(); }
    source ||= await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const cloud = await workspace();
    const bootstrap = JSON.stringify({...cloud,role:session.user.role}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const html = source.replace('<head>', '<head><script>window.__OLHAN_CLOUD__='+bootstrap+';</script>').replace('</body>', '<script src="/cloud.js"></script><script src="/auth-account.js"></script></body>');
    res.status(200); res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(req.method === 'HEAD' ? '' : html);
  } catch { res.status(503); res.setHeader('Content-Type','text/plain; charset=utf-8'); return res.end('Acesso temporariamente indisponível. Tente novamente em instantes.'); }
}

