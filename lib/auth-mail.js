import nodemailer from 'nodemailer';

export function smtpConfig(env = process.env) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) throw new Error('SMTP_NOT_CONFIGURED');
  const port = Number(env.SMTP_PORT || 465);
  if (![465, 587].includes(port)) throw new Error('SMTP_TLS_REQUIRED');
  return { host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s/g, '') },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, logger: false, debug: false };
}

export async function sendAccessMail({ to, kind, link, code }) {
  const transport = nodemailer.createTransport(smtpConfig());
  const login = kind === 'login';
  const subject = login ? 'Olhan — confirme seu acesso' : 'Olhan — crie ou redefina sua senha';
  const text = login
    ? `Foi solicitado um acesso ao Olhan com sua senha.\n\nConfirme no mesmo navegador em que iniciou o acesso:\n${link}\n\nSe o link abrir em outro navegador, digite este código na tela de acesso original: ${code}\n\nVálido por 10 minutos e uma única confirmação. Se não foi você, não confirme e redefina sua senha.`
    : `Para criar sua senha de administradora ou redefinir a senha do sistema Olhan, abra:\n${link}\n\nO link vale por 24 horas e só pode ser usado uma vez. Depois de salvar a senha, faça login e confirme o acesso pelo e-mail. Se não pediu este e-mail, ignore-o.`;
  try {
    const result = await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('EMAIL_NOT_ACCEPTED');
    // SMTP acceptance is evidence of sending, not of inbox delivery. Never log
    // the link, code, password, credentials or message body.
    console.info('ACCESS_EMAIL_ACCEPTED', { kind, messageId: result.messageId, acceptedCount: result.accepted.length });
  } catch (error) {
    console.error('ACCESS_EMAIL_FAILED', { code: error.code || 'SEND_FAILED', responseCode: error.responseCode || null });
    throw error;
  } finally { transport.close(); }
}
