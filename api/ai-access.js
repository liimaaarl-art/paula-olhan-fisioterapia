import { protect } from '../lib/auth-guard.js';
import { json } from '../lib/db.js';
import { sameOrigin, sessionCookie } from '../lib/ai-session.js';
// Compatibility for old tabs. Authorization always comes from individual login.
export async function handler(req, res) {
  if (!req.olhanUser) return json(res, 401, { error: 'Entre na sua conta para continuar.' });
  if (!['POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem não autorizada.' });
  res.setHeader('Set-Cookie', sessionCookie(''));
  return json(res, 200, { connected: !!process.env.GROQ_API_KEY });
}
export default protect(handler);
