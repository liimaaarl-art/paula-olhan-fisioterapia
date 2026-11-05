import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignedPatientIds, canAccessPatient } from './patient-scope.mjs';

const state = { team: [{id:'ana'}, {id:'paula'}], patients: [{id:'a', pro:'ana'}, {id:'b', pro:'paula'}, {id:'c'}] };
test('permite apenas pacientes vinculados pelo identificador da colaboradora', () => {
  assert.deepEqual([...assignedPatientIds(state, 'ana')], ['a']);
  assert.equal(canAccessPatient(state, 'ana', 'a'), true);
  assert.equal(canAccessPatient(state, 'ana', 'b'), false);
  assert.equal(canAccessPatient(state, 'ana', 'c'), false);
});
test('nega identificadores ausentes, desconhecidos ou duplicados', () => {
  assert.equal(canAccessPatient(state, '', 'a'), false);
  assert.equal(canAccessPatient(state, 'unknown', 'a'), false);
  assert.equal(canAccessPatient({...state, team:[...state.team, {id:'ana'}]}, 'ana', 'a'), false);
  assert.equal(canAccessPatient({...state, patients:[...state.patients, {id:'a', pro:'paula'}]}, 'ana', 'a'), false);
  assert.equal(canAccessPatient(null, 'ana', 'a'), false);
});
test('uma transferência remove o acesso imediatamente', () => {
  assert.equal(canAccessPatient({...state, patients:[{id:'a', pro:'paula'}]}, 'ana', 'a'), false);
});
