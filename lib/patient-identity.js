// Identity checks only. This module does not authenticate or expose patients.
export function normalizeCpf(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const input = String(value).trim();
  if (!/^[\d.\-\s]+$/.test(input)) return null;
  const cpf = input.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return null;
  function digit(length) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const value = (sum * 10) % 11;
    return value === 10 ? 0 : value;
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]) ? cpf : null;
}

export function validBirthDate(value, today = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const endOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getTime() <= endOfToday;
}

export function patientAccessEligibility(patient, patients, today = new Date()) {
  if (!patient || typeof patient.id !== 'string' || !Array.isArray(patients)) return 'invalid_patient';
  if (['Suspenso', 'Encerrado'].includes(patient.status)) return 'inactive_patient';
  const cpf = normalizeCpf(patient.cpf);
  if (!cpf) return 'invalid_cpf';
  if (!validBirthDate(patient.birth, today)) return 'invalid_birth';
  if (patients.some(other => other && other.id !== patient.id && normalizeCpf(other.cpf) === cpf)) return 'duplicate_cpf';
  return 'eligible';
}
