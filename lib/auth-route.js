import { delivery, ensureReservedAdmin, adminSession, normalizeEmail } from './auth.js';
import { getCookies } from 'better-auth/cookies';

const routes = new Map([
  ['/sign-in/email', 'POST'], ['/sign-out', 'POST'], ['/get-session', 'GET'],
  ['/request-password-reset', 'POST'], ['/reset-password', 'POST'],
  ['/change-password', 'POST'], ['/two-factor/send-otp', 'POST'], ['/two-factor/verify-otp', 'POST']
]);
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export async function authRequest(request, auth, { baseURL, adminEmail }) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '');
  if (!routes.has(path)) return reply(404, { error: 'Operação indisponível.' });
  if (routes.get(path) !== request.method) return reply(405, { error: 'Método não permitido.' });
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== baseURL) return reply(403, { error: 'Origem não autorizada.' });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { error: 'Envie JSON.' });
  }
  return delivery.run({ failed: false }, async () => {
    let body, rememberCookie;
    if (request.method === 'POST') {
      try { body = await request.json(); } catch { return reply(400, { error: 'Dados inválidos.' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Dados inválidos.' });
      if (body.trustDevice === true) return reply(400, { error: 'A confirmação por e-mail é obrigatória em cada login.' });
      if (path === '/sign-in/email') {
        body.rememberMe = body.rememberMe === true;
        // A new login replaces the previous preference, including an unfinished
        // short login. Only Better Auth's signed preference cookie is involved.
        rememberCookie = getCookies(auth.options).dontRememberToken;
        const headers = new Headers(request.headers);
        headers.set('cookie', (headers.get('cookie') || '').split(';').map(c => c.trim()).filter(c => c && c.split('=')[0] !== rememberCookie.name).join('; '));
        request = new Request(request.url, { method: 'POST', headers, body: JSON.stringify(body) });
      }
      if (path === '/change-password') {
        if (!await adminSession(request.headers, auth, adminEmail)) return reply(401, { error: 'Entre na sua conta.' });
        body.revokeOtherSessions = true;
      }
      if (path === '/request-password-reset') {
        const unavailable = () => reply(200, { status: true, message: 'If this email exists in our system, check your email for the reset link' });
        body.email = normalizeEmail(body.email);
        // Retired addresses remain reserved in the database so older
        // deployments cannot recreate them as administrators. Do not send
        // new invitations to them or restore a revoked role.
        if (!adminEmail || body.email !== normalizeEmail(adminEmail)) return unavailable();
        body.redirectTo = baseURL + '/login.html';
        await ensureReservedAdmin(auth, body.email, adminEmail);
        const ctx = await auth.$context;
        const account = await ctx.internalAdapter.findUserByEmail(body.email);
        if (account?.user.role !== 'admin') return unavailable();
      }
      request = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) });
    }
    let result = await auth.handler(request);
    if (path === '/sign-in/email' && result.ok) {
      const data = await result.clone().json();
      if (!data.twoFactorRedirect) {
        // A credential login must never bypass the e-mail challenge.
        return reply(403, { error: 'Esta conta não está habilitada para acesso.' });
      }
      if (body.rememberMe) result.headers.append('set-cookie', `${rememberCookie.name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${rememberCookie.attributes.secure ? '; Secure' : ''}`);
      const cookies = result.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      const headers = new Headers(request.headers); headers.set('cookie', cookies);
      const sent = await auth.handler(new Request(baseURL + '/api/auth/two-factor/send-otp', { method: 'POST', headers, body: '{}' }));
      if (!sent.ok) return reply(sent.status, { error: 'Não foi possível enviar a confirmação. Aguarde e tente entrar novamente.' });
    }
    if (delivery.getStore().failed) return reply(503, { error: 'Não foi possível enviar o e-mail. Aguarde e tente novamente.' });
    if (path === '/get-session') {
      const session = await adminSession(request.headers, auth, adminEmail);
      return reply(200, session ? { user: { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role } } : null);
    }
    // Session tokens stay in HttpOnly cookies, never in browser JavaScript.
    if (result.headers.get('content-type')?.includes('application/json')) {
      const data = await result.json();
      if (data && typeof data === 'object') delete data.token;
      result = new Response(JSON.stringify(data), { status: result.status, headers: result.headers });
    }
    result.headers.set('Cache-Control', 'no-store'); result.headers.set('Referrer-Policy', 'no-referrer');
    return result;
  });
}
