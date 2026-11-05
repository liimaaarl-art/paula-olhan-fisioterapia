// Draft authorization primitives. These functions are not yet connected to
// authentication or HTTP routes; do not enable collaborator login yet.
const clone = value => structuredClone(value);
const identifier = value => typeof value === 'string' && value.length > 0;
const items = (value, name) => {
  if (!Array.isArray(value)) throw new Error(`Coleção inválida: ${name}`);
  const ids = new Set();
  for (const item of value) {
    if (!item || !identifier(item.id) || ids.has(item.id)) throw new Error(`Identificador inválido: ${name}`);
    ids.add(item.id);
  }
  return value;
};

export function collaboratorContext(workspace, teamId) {
  if (!workspace || !identifier(teamId)) throw new Error('Vínculo profissional inválido.');
  const team = items(workspace.team, 'team');
  const patients = items(workspace.patients, 'patients');
  if (team.filter(member => member.id === teamId).length !== 1) throw new Error('Vínculo profissional inválido.');
  return { teamId, patients: new Set(patients.filter(patient => patient.pro === teamId).map(patient => patient.id)) };
}

// Explicit projection: unknown fields, finance, and patient contracts do not
// pass through merely because an application adds a new workspace key.
export function projectWorkspace(workspace, teamId) {
  const ctx = collaboratorContext(workspace, teamId);
  const ownPatient = value => ctx.patients.has(value.patient);
  const contracts = items(workspace.contracts || [], 'contracts').filter(contract =>
    contract.contractType === 'team' && contract.professionalId === teamId && !contract.patient
  );
  return clone({
    team: workspace.team.filter(member => member.id === teamId),
    patients: workspace.patients.filter(patient => ctx.patients.has(patient.id)),
    appointments: items(workspace.appointments, 'appointments').filter(ownPatient),
    records: items(workspace.records, 'records').filter(ownPatient),
    files: items(workspace.files, 'files').filter(ownPatient),
    contracts
  });
}

// Apply a single clinical edit against the CURRENT server state. The caller
// must still perform a revision-checked atomic database write. Deletes,
// transfers, files and all other collections are intentionally unsupported.
export function applyClinicalChange(workspace, teamId, collection, candidate) {
  const ctx = collaboratorContext(workspace, teamId);
  if (!['appointments', 'records'].includes(collection) || !candidate || !identifier(candidate.id)) throw new Error('Operação não permitida.');
  if (!ctx.patients.has(candidate.patient) || candidate.pro !== teamId) throw new Error('Paciente ou profissional não autorizado.');
  const rows = items(workspace[collection], collection);
  const original = rows.find(row => row.id === candidate.id);
  if (original && (original.patient !== candidate.patient || original.pro !== teamId)) throw new Error('Alteração não autorizada.');
  if (collection === 'records' && candidate.appointment) {
    const appointment = items(workspace.appointments, 'appointments').find(row => row.id === candidate.appointment);
    if (!appointment || appointment.patient !== candidate.patient || appointment.pro !== teamId) throw new Error('Atendimento não autorizado.');
  }
  const next = clone(workspace);
  if (original) next[collection] = next[collection].map(row => row.id === candidate.id ? clone(candidate) : row);
  else next[collection].push(clone(candidate));
  return next;
}
