// Preliminary authorization primitive. Not integrated into the application.
// Assignment is based on the unique team ID recorded on the patient, never on a name.
export function assignedPatientIds(workspace, teamId) {
  if (typeof teamId !== 'string' || !teamId || !Array.isArray(workspace?.team) || !Array.isArray(workspace?.patients)) return new Set();
  if (workspace.team.filter(member => member?.id === teamId).length !== 1) return new Set();
  const counts = new Map();
  for (const patient of workspace.patients) {
    if (typeof patient?.id === 'string' && patient.id) counts.set(patient.id, (counts.get(patient.id) || 0) + 1);
  }
  return new Set(workspace.patients.filter(patient => patient?.pro === teamId && counts.get(patient.id) === 1).map(patient => patient.id));
}

export function canAccessPatient(workspace, teamId, patientId) {
  return typeof patientId === 'string' && assignedPatientIds(workspace, teamId).has(patientId);
}
