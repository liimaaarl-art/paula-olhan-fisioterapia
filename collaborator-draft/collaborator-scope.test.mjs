import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collaboratorContext, projectWorkspace, applyClinicalChange } from './collaborator-scope.mjs';
const sample = () => ({team:[{id:'ana'}, {id:'paula'}], patients:[{id:'a', pro:'ana'}, {id:'b', pro:'paula'}], appointments:[{id:'aa',patient:'a',pro:'ana'},{id:'bb',patient:'b',pro:'paula'}], records:[{id:'ra',patient:'a',pro:'ana'},{id:'rb',patient:'b',pro:'paula'}], files:[{id:'fa',patient:'a'},{id:'fb',patient:'b'}], contracts:[{id:'ct',contractType:'team',professionalId:'ana'},{id:'cp',contractType:'patient',patient:'a',professionalId:'ana'},{id:'co',contractType:'team',professionalId:'paula'}], invoices:[{id:'i'}], secret:'secret'});
test('resposta inclui só pacientes e contrato próprio e omite dados não autorizados', () => {
 const out=projectWorkspace(sample(),'ana');
 assert.deepEqual(out.patients.map(x=>x.id),['a']);
 assert.deepEqual(out.appointments.map(x=>x.id),['aa']);
 assert.deepEqual(out.records.map(x=>x.id),['ra']);
 assert.deepEqual(out.files.map(x=>x.id),['fa']);
 assert.deepEqual(out.contracts.map(x=>x.id),['ct']);
 assert.equal('invoices' in out,false); assert.equal('secret' in out,false);
});
test('nega profissionais ausentes e chaves duplicadas', () => {
 assert.throws(()=>collaboratorContext(sample(),'')); assert.throws(()=>collaboratorContext(sample(),'outra'));
 const s=sample();s.patients.push({id:'a',pro:'paula'});assert.throws(()=>projectWorkspace(s,'ana'));
});
test('uma transferência revoga o escopo ao consultar o estado atualizado', () => {
 const s=sample();s.patients[0].pro='paula';assert.deepEqual(projectWorkspace(s,'ana').patients,[]);
});
test('edita somente atendimento próprio sem alterar o restante do estado', () => {
 const s=sample();const out=applyClinicalChange(s,'ana','appointments',{id:'aa',patient:'a',pro:'ana',status:'Realizado'});
 assert.equal(out.appointments[0].status,'Realizado');assert.deepEqual(out.appointments[1],s.appointments[1]);assert.deepEqual(out.invoices,s.invoices);assert.equal(s.appointments[0].status,undefined);
});
test('nega troca de paciente, profissional e sobrescrita de registro alheio', () => {
 const s=sample();
 for (const [collection,row] of [['appointments',{id:'bb',patient:'a',pro:'ana'}],['records',{id:'rnew',patient:'b',pro:'ana'}],['records',{id:'rnew',patient:'a',pro:'paula'}],['contracts',{id:'ct',patient:'a',pro:'ana'}]]) assert.throws(()=>applyClinicalChange(s,'ana',collection,row));
});
test('impede vincular evolução a atendimento de outra pessoa', () => {
 const s=sample();assert.throws(()=>applyClinicalChange(s,'ana','records',{id:'rnew',patient:'a',pro:'ana',appointment:'bb'}));
 assert.equal(applyClinicalChange(s,'ana','records',{id:'rnew',patient:'a',pro:'ana',appointment:'aa'}).records.length,3);
});
