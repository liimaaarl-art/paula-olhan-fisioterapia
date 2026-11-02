// Helpers for future server-side patient routes. Patient identity must come
// from an authenticated session, never from a request parameter.
const fileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedMedia = new Set(['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','application/pdf']);

function activePatient(workspace, session) {
  if (!workspace || !Array.isArray(workspace.patients) || !session ||
      session.role !== 'patient' || typeof session.patientId !== 'string' || !session.patientId) return null;
  const matches = workspace.patients.filter(p => p && p.id === session.patientId);
  if (matches.length !== 1 || ['Suspenso','Encerrado'].includes(matches[0].status)) return null;
  return matches[0];
}

// Only allowlisted fields are returned; never return the workspace, storage
// keys, clinical drafts, other patients' records or financial data.
export function patientPortalView(workspace, session) {
  const patient = activePatient(workspace, session);
  if (!patient) return null;
  const files = Array.isArray(workspace.files) ? workspace.files : [];
  const appointments = Array.isArray(workspace.appointments) ? workspace.appointments : [];
  const media = files.filter(f => f && f.patient === patient.id && allowedMedia.has(f.type) &&
    typeof (f.cloudId || f.id) === 'string' && fileIdPattern.test(f.cloudId || f.id) &&
    f.data === '/api/files?id=' + (f.cloudId || f.id)).map(f => ({
      id: f.cloudId || f.id, name: typeof f.name === 'string' ? f.name.slice(0,240) : 'Arquivo',
      type: f.type, date: typeof f.date === 'string' ? f.date : ''
    }));
  const schedule = appointments.filter(a => a && a.patient === patient.id).map(a => ({
    date: typeof a.date === 'string' ? a.date : '', time: typeof a.time === 'string' ? a.time : '',
    status: typeof a.status === 'string' ? a.status : ''
  }));
  const labels={general:'Informações gerais',functional:'Funcionalidade',conduct:'Conduta',response:'Resposta ao atendimento',goal:'Objetivos',recommendations:'Orientações'};
  const records=(Array.isArray(workspace.records)?workspace.records:[]).filter(r=>r&&r.patient===patient.id&&!r.draft).map(r=>({type:typeof r.type==='string'?r.type:'Atendimento',date:typeof r.date==='string'?r.date:'',fields:Object.entries(labels).filter(([key])=>typeof r[key]==='string'&&r[key].trim()).map(([key,label])=>({label,text:r[key]}))})).filter(r=>r.fields.length);
  return { name: typeof patient.name === 'string' ? patient.name : '', media, appointments: schedule, records };
}

// Both the workspace reference and the server-side file record must match
// the authenticated patient, even if a caller knows another file's UUID.
export function patientMayReadFile(workspace, session, fileRecord) {
  const patient = activePatient(workspace, session);
  if (!patient || !fileRecord || fileRecord.patient_id !== patient.id ||
      typeof fileRecord.id !== 'string' || !fileIdPattern.test(fileRecord.id) ||
      !allowedMedia.has(fileRecord.mime) || !Array.isArray(workspace.files)) return false;
  return workspace.files.some(f => f && f.patient === patient.id &&
    (f.cloudId || f.id) === fileRecord.id && f.type === fileRecord.mime &&
    f.data === '/api/files?id=' + fileRecord.id);
}
