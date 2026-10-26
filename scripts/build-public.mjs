import { mkdir, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
if (process.env.OLHAN_AUTH_SELF_TEST === '1' && process.env.VERCEL_ENV === 'preview') {
  const check = spawnSync(process.execPath, ['--test', 'tests/auth-postgres.test.mjs', 'tests/cloud-postgres.test.mjs'], { stdio: 'inherit', env: { ...process.env, AUTH_TEST_DATABASE_URL: process.env.DATABASE_URL } });
  if (check.status !== 0) throw new Error('Isolated Postgres authentication verification failed');
}
// Only explicitly public UI assets are deployed as static files. The clinical
// app HTML is served exclusively by api/app.js after a database session check.
await rm('public', { recursive: true, force: true });
await mkdir('public');
for (const file of ['cloud.js','login.html','auth-ui.css','auth-ui.js','auth-account.js','care.css','care.js','bi.css','bi.js','schedule.js','assistant-actions.js','assistant.css','assistant.js','team-contracts.js']) await copyFile(file, 'public/' + file);


if (process.env.VERCEL_ENV === 'production') await import('./provision-support.mjs');
