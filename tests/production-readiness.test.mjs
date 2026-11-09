import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const staff=readFileSync(new URL('../portal/staff-patient-access.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build-public.mjs',import.meta.url),'utf8');
test('production has no patient or finance demo limits and cannot restore sample data from settings',()=>{
 assert.doesNotMatch(index,/id="demo-limit-layer"/);
 assert.doesNotMatch(index,/Demonstração · dados neste navegador/);
 assert.doesNotMatch(index,/btn\('Restaurar exemplos'/);
 assert.doesNotMatch(index,/Portal demonstrativo de \$\{esc\(p.name\)\}/);
});
test('patient access button uses real invite flow and test portal is not deployed',()=>{
 assert.match(staff,/window\.openPatientPortal=function\(pid\)/);
 assert.match(staff,/action:'invite'/);
 assert.doesNotMatch(build,/'paciente-demonstracao\.html'/);
 assert.doesNotMatch(build,/public\/patient-demo-documento\.pdf/);
});
