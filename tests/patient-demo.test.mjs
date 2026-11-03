import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../portal/patient-demo.js',import.meta.url),'utf8');
function demo(){const context={window:{},URLSearchParams,fetch(){throw Error('Preview must never call the network');}};vm.runInNewContext(source,context);return context.window.OlhanPatientDemo;}
test('demo login opens sample content only and logout removes access',async()=>{
 const d=demo();await assert.rejects(d.request(),/Entre/);await assert.rejects(d.request({action:'login',cpf:'admin',password:'errada'}),/incorretos/);
 await d.request({action:'login',cpf:'admin',password:'olhan'});
 const view=await d.request(null,'?patientId=another-patient');assert.equal(view.name,'Paula Olhan');assert.equal(view.media.length,3);assert.ok(!('cpf' in view));
 view.name='Changed';assert.equal((await d.request()).name,'Paula Olhan');
 assert.equal((await d.request(null,'?action=file&id=demo-video')).url,'/patient-demo-video.mp4');
 assert.equal((await d.request(null,'?action=file&id=demo-document')).url,'/patient-demo-documento.pdf');
 await assert.rejects(d.request(null,'?action=file&id=private-file'),/não encontrado/);
 await assert.rejects(d.request({action:'invite'}),/apenas visualizar/);
 await d.request({action:'logout'});await assert.rejects(d.request(),/Entre/);
});
