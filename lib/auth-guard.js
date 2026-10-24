import { adminSession } from './auth.js';
import { json } from './db.js';

export function incomingHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  return headers;
}
export function protect(handler, getSession = adminSession) {
  return async (req, res) => {
    try {
      const session = await getSession(incomingHeaders(req));
      if (!session) return json(res, 401, { error: 'Entre na sua conta para continuar.' });
      req.olhanUser = session.user;
      return await handler(req, res);
    } catch { return json(res, 503, { error: 'Acesso temporariamente indisponível.' }); }
  };
}
