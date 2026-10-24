(() => {
  'use strict';
  const content = document.getElementById('access-content'), message = document.getElementById('access-message');
  const initial = new URLSearchParams(location.hash.slice(1));
  const resetToken = initial.get('reset'), confirmCode = initial.get('confirm');
  const account = location.hash === '#account';
  if (resetToken || confirmCode) history.replaceState(null, '', '/login.html');
  const say = (text, error = false) => { message.textContent = text; message.className = error ? 'error' : ''; };
  const input = (label, name, type, autocomplete, extra = '') => `<label>${label}<input name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}></label>`;
  const passwords = () => input('Nova senha (mínimo de 12 caracteres)', 'password', 'password', 'new-password', 'minlength="12" maxlength="128"') + input('Repita a nova senha', 'repeat', 'password', 'new-password', 'minlength="12" maxlength="128"');
  async function api(path, body) {
    const response = await fetch('/api/auth/' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      const errors = {
        INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.', EMAIL_NOT_VERIFIED: 'Crie sua senha pelo link enviado ao e-mail cadastrado.',
        INVALID_PASSWORD: 'A senha atual está incorreta.', INVALID_TOKEN: 'O link é inválido, já foi usado ou venceu. Solicite outro.',
        INVALID_CODE: 'A confirmação está incorreta. Confira o e-mail mais recente.', OTP_HAS_EXPIRED: 'A confirmação venceu ou já foi usada. Entre novamente.',
        TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Limite de tentativas atingido. Entre novamente.', INVALID_TWO_FACTOR_COOKIE: 'Volte ao navegador em que iniciou o acesso e digite o código do e-mail.'
      };
      throw new Error(response.status === 429 ? 'Aguarde um minuto antes de tentar novamente.' : errors[data?.code] || data?.error || 'Não foi possível concluir. Confira os dados e tente novamente.');
    }
    return data;
  }
  function form(html, action) {
    content.innerHTML = html; say('');
    const el = content.querySelector('form');
    if (el) el.addEventListener('submit', async event => {
      event.preventDefault(); const button = el.querySelector('button[type="submit"]'); button.disabled = true; say('Aguarde…');
      try { await action(new FormData(el)); } catch (e) { say(e.message || 'Falha de conexão. Tente novamente.', true); }
      finally { if (button.isConnected) button.disabled = false; }
    });
  }
  function login() {
    form('<h1>Entrar no Olhan</h1><p>Use seu e-mail e senha. Depois, confirme o acesso pelo link enviado ao seu e-mail.</p><form id="login-form" method="post" action="/api/auth/sign-in/email">' + input('E-mail cadastrado', 'email', 'email', 'username') + input('Senha', 'password', 'password', 'current-password') + '<label class="remember-choice"><input name="remember" type="checkbox"><span>Manter conectado neste navegador por 30 dias</span></label><p class="note">Marque em um aparelho de uso pessoal. Você entrará direto enquanto a sessão estiver válida. Para salvar a senha, use a opção oferecida pelo navegador.</p><button type="submit">Entrar</button></form><a class="text-link" href="#" id="forgot">Primeiro acesso ou esqueci minha senha</a>', async data => {
      await api('sign-in/email', { email: data.get('email').trim(), password: data.get('password'), rememberMe: data.get('remember') === 'on' });
      challenge();
    });
    document.getElementById('forgot').onclick = e => { e.preventDefault(); resetRequest(); };
  }
  function resetRequest() {
    form('<h1>Crie ou redefina sua senha</h1><p>Enviaremos o link para o e-mail cadastrado no sistema.</p><form>' + input('E-mail cadastrado', 'email', 'email', 'username') + '<button type="submit">Enviar link por e-mail</button></form><a class="text-link" href="/login.html">Voltar para entrar</a>', async data => {
      await api('request-password-reset', { email: data.get('email').trim() });
      say('Se o e-mail estiver cadastrado, o link chegará em instantes. Confira também a pasta de spam. Ele vale por 30 minutos.');
    });
  }
  async function confirm(code) {
    await api('two-factor/verify-otp', { code: code.trim(), trustDevice: false });
    location.replace('/');
  }
  function challenge(code = '') {
    form('<h1>Confirme seu acesso</h1><p>Abra o link do e-mail no mesmo navegador em que digitou sua senha. A confirmação vale por 10 minutos.</p><p>Se o e-mail abrir em outro navegador, digite o código abaixo na tela original de acesso.</p><form>' + input('Código do e-mail', 'code', 'text', 'one-time-code', 'inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8"') + '<button type="submit">Confirmar e entrar</button></form><button class="secondary" id="resend">Reenviar confirmação</button><a class="text-link" href="/login.html">Voltar para entrar</a>', data => confirm(data.get('code')));
    content.querySelector('[name="code"]').value = /^\d{8}$/.test(code) ? code : '';
    document.getElementById('resend').onclick = async event => {
      event.target.disabled = true;
      try { await api('two-factor/send-otp', { trustDevice: false }); say('Nova confirmação enviada. Use o e-mail mais recente.'); }
      catch (e) { say(e.message, true); } finally { event.target.disabled = false; }
    };
  }
  function reset() {
    form('<h1>Escolha sua senha</h1><p>Use uma senha exclusiva para o Olhan, com pelo menos 12 caracteres.</p><form>' + passwords() + '<button type="submit">Salvar senha</button></form>', async data => {
      if (data.get('password') !== data.get('repeat')) throw Error('As senhas precisam ser iguais.');
      await api('reset-password', { token: resetToken, newPassword: data.get('password') });
      login(); say('Senha salva. Entre com seu e-mail e a nova senha para receber a confirmação de acesso.');
    });
  }
  async function accountPage() {
    const session = await api('get-session');
    if (!session) { login(); say('Entre na sua conta para trocar a senha.'); return; }
    form('<h1>Minha conta</h1><p class="email" id="account-email"></p><form>' + input('Senha atual', 'current', 'password', 'current-password') + passwords() + '<button type="submit">Trocar senha</button></form><a class="button secondary" href="/">Voltar ao sistema</a><button class="secondary" id="logout">Sair da conta</button>', async data => {
      if (data.get('password') !== data.get('repeat')) throw Error('As senhas precisam ser iguais.');
      await api('change-password', { currentPassword: data.get('current'), newPassword: data.get('password'), revokeOtherSessions: true });
      await api('sign-out', {}); login(); say('Senha alterada. Entre novamente e confirme pelo e-mail.');
    });
    document.getElementById('account-email').textContent = session.user.email;
    document.getElementById('logout').onclick = async () => { try { await api('sign-out', {}); location.replace('/login.html'); } catch (e) { say(e.message, true); } };
  }
  async function start() {
    if (resetToken) return reset();
    if (confirmCode) { challenge(confirmCode); return; }
    if (account) return accountPage();
    if (await api('get-session')) location.replace('/'); else login();
  }
  start().catch(() => { login(); say('Não foi possível consultar o acesso. Tente novamente em instantes.', true); });
})();
