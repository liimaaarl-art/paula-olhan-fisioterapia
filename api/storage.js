import { protect } from '../lib/auth-guard.js';
import { r2Config, probeR2 } from '../lib/r2.js';
import { json } from '../lib/db.js';

// Boolean connection information only. Never return credentials, object names,
// provider errors or signed URLs. Single-flight/cache limit repeated probes.
export function storageHandler({ config = r2Config, probe = probeR2, now = Date.now } = {}) {
  let cache, pending;
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Envio e acesso a vídeos aguardam autenticação individual.', code: 'STORAGE_ACCESS_NOT_ENABLED' });
    }
    const cfg = config();
    if (!cfg) return json(res, 200, { configured: false, connected: false, uploadsEnabled: false, accessEnabled: false, reason: 'CONFIGURATION_REQUIRED' });
    // The cache key stays in server memory and is never returned or logged.
    const key = JSON.stringify(cfg);
    if (!cache || cache.key !== key || cache.until <= now()) {
      if (!pending || pending.key !== key) {
        const promise = Promise.resolve().then(() => probe(cfg)).then(Boolean, () => false);
        pending = { key, promise };
      }
      const current = pending;
      const connected = await current.promise;
      cache = { key, connected, until: now() + (connected ? 300000 : 60000) };
      if (pending === current) pending = null;
    }
    return json(res, 200, {
      configured: true, connected: cache.connected,
      uploadsEnabled: false, accessEnabled: false,
      reason: cache.connected ? 'INDIVIDUAL_AUTH_REQUIRED' : 'CONNECTION_FAILED',
    });
  };
}

export default protect(storageHandler());
