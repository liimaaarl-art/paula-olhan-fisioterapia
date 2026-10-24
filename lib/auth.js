import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sendAccessMail } from './auth-mail.js';

export const delivery = new AsyncLocalStorage();
export const normalizeEmail = value => String(value || '').trim().toLowerCase();

export function createAuth({ database, secret, baseURL, adminEmail, sendMail = sendAccessMail, rateLimit = true }) {
  let auth;
  const send = async message => {
    try { await sendMail(message); }
    catch { const state = delivery.getStore(); if (state) state.failed = true; throw new Error('ACCESS_EMAIL_DELIVERY_FAILED'); }
  };
  auth = betterAuth({
    appName: 'Olhan', baseURL, basePath: '/api/auth', secret,
    database,
    trustedOrigins: [baseURL],
    logger: { disabled: true },
    advanced: { cookiePrefix: 'olhan', useSecureCookies: baseURL.startsWith('https:') },
    user: { modelName: 'olhan_auth_user', additionalFields: { role: { type: 'string', defaultValue: 'member', input: false } }, changeEmail: { enabled: false } },
    account: { modelName: 'olhan_auth_account' },
    verification: { modelName: 'olhan_auth_verification', storeIdentifier: 'hashed' },
    session: { modelName: 'olhan_auth_session', expiresIn: 8 * 60 * 60, updateAge: 60 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: rateLimit, storage: 'database', modelName: 'olhan_auth_rate_limit', window: 60, max: 30,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/request-password-reset': { window: 60, max: 2 }, '/two-factor/send-otp': { window: 60, max: 2 }, '/two-factor/verify-otp': { window: 60, max: 5 } } },
    emailAndPassword: {
      enabled: true, disableSignUp: true, autoSignIn: false, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: true, resetPasswordTokenExpiresIn: 30 * 60, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const link = new URL('/login.html', baseURL); link.hash = 'reset=' + encodeURIComponent(token);
        await send({ to: user.email, kind: 'reset', link: link.href });
      },
      onPasswordReset: async ({ user }) => {
        const ctx = await auth.$context;
        await ctx.internalAdapter.updateUser(user.id, { emailVerified: true, twoFactorEnabled: true });
      }
    },
    databaseHooks: { user: { create: { before: async user => ({ data: { ...user, role: normalizeEmail(user.email) === normalizeEmail(adminEmail) ? 'admin' : 'member', twoFactorEnabled: true } }) } } },
    plugins: [twoFactor({
      twoFactorCookieMaxAge: 10 * 60,
      totpOptions: { disable: true },
      otpOptions: { period: 10, digits: 8, allowedAttempts: 5, storeOTP: 'hashed', sendOTP: async ({ user, otp }) => {
        const link = new URL('/login.html', baseURL); link.hash = 'confirm=' + otp;
        await send({ to: user.email, kind: 'login', link: link.href, code: otp });
      } },
      schema: { twoFactor: { modelName: 'olhan_auth_two_factor' } }
    })]
  });
  return auth;
}

let singleton;
export function getAuth() {
  if (singleton) return singleton;
  const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, OLHAN_ADMIN_EMAIL } = process.env;
  if (!DATABASE_URL || !BETTER_AUTH_SECRET || !BETTER_AUTH_URL || !OLHAN_ADMIN_EMAIL) throw new Error('AUTH_NOT_CONFIGURED');
  singleton = createAuth({ database: new Pool({ connectionString: DATABASE_URL, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 }), secret: BETTER_AUTH_SECRET, baseURL: BETTER_AUTH_URL, adminEmail: OLHAN_ADMIN_EMAIL });
  return singleton;
}

export async function ensureReservedAdmin(auth, email, reservedEmail) {
  if (!reservedEmail || normalizeEmail(email) !== normalizeEmail(reservedEmail)) return;
  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(normalizeEmail(email))) return;
  try { await ctx.internalAdapter.createUser({ email: normalizeEmail(email), name: 'Paula Olhan', emailVerified: false, role: 'admin', twoFactorEnabled: true }); }
  catch (error) { if (!await ctx.internalAdapter.findUserByEmail(normalizeEmail(email))) throw error; }
}

export async function adminSession(headers, auth = getAuth(), reservedEmail = process.env.OLHAN_ADMIN_EMAIL) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user || !session.user.emailVerified || !session.user.twoFactorEnabled || session.user.role !== 'admin' || normalizeEmail(session.user.email) !== normalizeEmail(reservedEmail)) return null;
  return session;
}
