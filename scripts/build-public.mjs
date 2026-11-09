import { mkdir, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
if (process.env.OLHAN_AUTH_SELF_TEST === '1' && process.env.VERCEL_ENV === 'preview') {
  const suite=spawnSync('npm',['test'],{stdio:'inherit',env:{...process.env,OLHAN_AUTH_SELF_TEST:'0'}});
  if(suite.status!==0)throw new Error('Application test suite failed');
  const check = spawnSync(process.execPath, ['--test', 'tests/auth-postgres.test.mjs', 'tests/cloud-postgres.test.mjs'], { stdio: 'inherit', env: { ...process.env, AUTH_TEST_DATABASE_URL: process.env.DATABASE_URL } });
  if (check.status !== 0) throw new Error('Isolated Postgres authentication verification failed');
}
// Only explicitly public UI assets are deployed as static files. The clinical
// app HTML is served exclusively by api/app.js after a database session check.
await rm('public', { recursive: true, force: true });
await mkdir('public');
for (const file of ['cloud.js','login.html','auth-ui.css','auth-ui.js','auth-account.js','care.css','care.js','bi.css','bi.js','schedule.js','assistant-actions.js','assistant.css','assistant.js','team-contracts.js','collaborator.js','collaborator.css','collaborator-admin.js']) await copyFile(file, 'public/' + file);


for(const file of ['paciente.html','patient-portal.js','patient-portal.css','staff-patient-access.js']) await copyFile('portal/'+file,'public/'+file);
await copyFile('website/assets/logo-olhan-transparente.png','public/patient-logo.png');
await mkdir('public/patient-fonts',{recursive:true});
for(const file of ['BodoniModa.woff','Manrope.woff','Garet-Book.woff'])await copyFile('website/assets/fonts/'+file,'public/patient-fonts/'+file);
const portalChecks=spawnSync(process.execPath,['--test','tests/patient-demo.test.mjs','tests/patient-navigation.test.mjs','tests/patient-profile.test.mjs','tests/production-readiness.test.mjs'],{stdio:'inherit'});
if(portalChecks.status!==0)throw Error('Patient portal navigation checks failed');
if(process.env.OLHAN_PATIENT_TEST==='1' && process.env.VERCEL_ENV==='preview') await import('./verify-patient-portal.mjs');
if (process.env.VERCEL_ENV === 'production') {
 await import('./verify-private-storage.mjs');
 if(process.env.OLHAN_MEDIA_SELF_TEST==='1')await import('./verify-direct-media.mjs');
 await import('./provision-support.mjs');
 if(process.env.OLHAN_PORTAL_FIXTURE==='1')await import('./prepare-patient-fixture.mjs');
}

