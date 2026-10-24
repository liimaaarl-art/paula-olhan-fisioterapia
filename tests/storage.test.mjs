import { test } from 'node:test';
import assert from 'node:assert/strict';
import { r2Config, probeR2 } from '../lib/r2.js';
import { storageHandler } from '../api/storage.js';

const env = { R2_ENDPOINT: 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com', R2_BUCKET_NAME: 'clinic-videos', R2_ACCESS_KEY_ID: 'fake-key', R2_SECRET_ACCESS_KEY: 'fake-secret' };
const res = () => ({ headers: {}, status(n) { this.statusCode = n; return this; }, setHeader(k,v) { this.headers[k] = v; }, end(body) { this.body = JSON.parse(body); } });
test('R2 aceita variáveis canônicas e nomes cadastrados com ACESS, sem expor segredos', () => {
  assert.equal(r2Config(env).credentials.accessKeyId, 'fake-key');
  const legacy = { ...env, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_ACESS_KEY_ID: 'old-key', R2_SECRET_ACESS_KEY: 'old-secret' };
  assert.deepEqual(r2Config(legacy).credentials, { accessKeyId: 'old-key', secretAccessKey: 'old-secret' });
  assert.equal(r2Config({ ...legacy, ...env }).credentials.accessKeyId, 'fake-key');
  for (const key of Object.keys(env)) assert.equal(r2Config({ ...env, [key]: '' }), null);
});
test('R2 rejeita endpoints fora da Cloudflare, caminhos e nomes inválidos antes de acessar rede', () => {
  for (const endpoint of ['http://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com', 'https://evil.test', env.R2_ENDPOINT + '/clinic-videos', env.R2_ENDPOINT + '?secret=bad', 'https://user:password@' + 'a'.repeat(32) + '.r2.cloudflarestorage.com']) assert.equal(r2Config({ ...env, R2_ENDPOINT: endpoint }), null);
  assert.equal(r2Config({ ...env, R2_BUCKET_NAME: '../other' }), null);
});
test('sonda usa somente HeadBucket, prazo limitado e libera o cliente em sucesso/erro', async () => {
  let destroyed = 0, command;
  const client = { send: async (c, options) => { command = c; assert.ok(options.abortSignal); }, destroy: () => destroyed++ };
  assert.equal(await probeR2(r2Config(env), client), true);
  assert.equal(command.constructor.name, 'HeadBucketCommand');
  assert.deepEqual(command.input, { Bucket: 'clinic-videos' });
  client.send = async () => { throw new Error('provider-secret'); };
  await assert.rejects(probeR2(r2Config(env), client));
  assert.equal(destroyed, 2);
});
test('status confirma conexão com cache e bloqueia escrita mesmo com sessão de IA', async () => {
  let calls = 0, time = 1000;
  const handler = storageHandler({ config: () => r2Config(env), probe: async () => { calls++; return true; }, now: () => time });
  const results = await Promise.all(Array.from({ length: 3 }, async () => { const r = res(); await handler({ method: 'GET' }, r); return r; }));
  assert.equal(calls, 1);
  for (const r of results) {
    assert.deepEqual(r.body, { configured: true, connected: true, uploadsEnabled: false, accessEnabled: false, reason: 'INDIVIDUAL_AUTH_REQUIRED' });
    assert.equal(r.headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify(r.body).includes('fake-'));
  }
  time += 300001;
  await handler({ method: 'GET' }, res()); assert.equal(calls, 2);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const r = res(); await handler({ method, headers: { cookie: '__Host-olhan-ai=anything' }, body: { action: 'upload', key: 'patient.mp4' } }, r);
    assert.equal(r.statusCode, 405); assert.equal(r.body.code, 'STORAGE_ACCESS_NOT_ENABLED');
  }
  assert.equal(calls, 2);
});
test('configuração ausente não acessa R2; erro do provedor nunca vaza na resposta', async () => {
  let calls = 0;
  const missing = res(); await storageHandler({ config: () => null, probe: async () => calls++ })({ method: 'GET' }, missing);
  assert.equal(calls, 0); assert.equal(missing.body.configured, false);
  const r = res(); await storageHandler({ config: () => r2Config(env), probe: async () => { throw new Error('secret-key-signed-url'); } })({ method: 'GET' }, r);
  assert.equal(r.body.reason, 'CONNECTION_FAILED'); assert.ok(!JSON.stringify(r.body).includes('secret-key'));
});
