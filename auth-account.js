(() => {
  const previous = window.settings;
  if (typeof previous === 'function') window.settings = function (...args) {
    return previous.apply(this, args) + '<section class="card care-section"><div class="settingrow"><div><h3>Minha conta</h3><p>Acesso de administradora. Troque sua senha ou encerre a sessão.</p></div><a class="btn secondary" href="/login.html#account">Conta e senha</a></div></section>';
  };
  let checking = false;
  window.addEventListener('focus', async () => {
    if (checking) return; checking = true;
    try {
      const response = await fetch('/api/auth/get-session', { cache: 'no-store', credentials: 'same-origin' });
      if (response.ok && !await response.json()) location.replace('/login.html');
    } catch {} finally { checking = false; }
  });
})();
