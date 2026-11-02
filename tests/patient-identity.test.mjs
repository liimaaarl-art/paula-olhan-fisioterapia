import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCpf, validBirthDate, patientAccessEligibility } from '../lib/patient-identity.js';

test('normalize and validate CPF including check digits', () => {
  assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
  for (const cpf of ['111.111.111-11', '52998224726', '5299822472', '52998224725x', '']) assert.equal(normalizeCpf(cpf), null);
});
test('validate real calendar dates and reject future dates', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(validBirthDate('2000-02-29', now), true);
  for (const date of ['2001-02-29','2026-11-03','2020-13-01','1899-12-31','02/11/2026','']) assert.equal(validBirthDate(date, now), false);
});
test('eligibility requires identity data, active status and a unique CPF', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  const p = {id:'p1',cpf:'529.982.247-25',birth:'1980-05-01',status:'Ativo'};
  assert.equal(patientAccessEligibility(p,[p],now),'eligible');
  assert.equal(patientAccessEligibility({...p,cpf:''},[p],now),'invalid_cpf');
  assert.equal(patientAccessEligibility({...p,birth:''},[p],now),'invalid_birth');
  assert.equal(patientAccessEligibility({...p,status:'Suspenso'},[p],now),'inactive_patient');
  assert.equal(patientAccessEligibility(p,[p,{id:'p2',cpf:'52998224725'}],now),'duplicate_cpf');
});
