import { getAuth } from '../../lib/auth.js';
import { authRequest } from '../../lib/auth-route.js';
import { incomingHeaders } from '../../lib/auth-guard.js';
import { json } from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const baseURL = process.env.BETTER_AUTH_URL;
    const path = new URL(req.url, baseURL).pathname;
    if (!path.startsWith('/api/auth/')) return json(res, 404, { error: 'Operação indisponível.' });
    const headers = incomingHeaders(req);
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      if (Buffer.byteLength(body) > 4096) return json(res, 413, { error: 'Dados acima do limite.' });
    }
    const request = new Request(baseURL + path, { method: req.method, headers, body });
    const response = await authRequest(request, getAuth(), { baseURL, adminEmail: process.env.OLHAN_ADMIN_EMAIL });
    res.status(response.status);
    for (const [key, value] of response.headers) if (!['set-cookie','content-length'].includes(key)) res.setHeader(key, value);
    const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
    return res.end(await response.text());
  } catch { return json(res, 503, { error: 'Acesso temporariamente indisponível. Tente novamente em instantes.' }); }
}
