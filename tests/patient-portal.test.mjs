import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patientPortalView, patientMayReadFile } from '../lib/patient-portal.js';

const one='11111111-1111-4111-8111-111111111111', two='22222222-2222-4222-8222-222222222222';
const workspace={patients:[{id:'p1',name:'Paciente 1',cpf:'secret',price:123},{id:'p2',name:'Paciente 2'}],
 files:[{id:one,patient:'p1',name:'Foto',type:'image/jpeg',data:'/api/files?id='+one},
        {id:two,patient:'p2',name:'Vídeo',type:'video/mp4',data:'/api/files?id='+two}],
 appointments:[{patient:'p1',date:'2026-11-02',time:'09:00',price:123},{patient:'p2',date:'2026-11-03',time:'10:00'}],
 records:[{patient:'p1',notes:'restrito'}], invoices:[{patient:'p1',price:123}]};
const session={role:'patient',patientId:'p1'};
test('exposes only explicitly selected fields belonging to the authenticated patient',()=>{
 const p=patientPortalView(workspace,session);
 assert.deepEqual(p.media.map(f=>f.id),[one]);assert.equal(p.appointments.length,1);
 assert.equal(JSON.stringify(p).includes('secret'),false);
 assert.equal(JSON.stringify(p).includes('restrito'),false);
 assert.equal(JSON.stringify(p).includes('123'),false);
});
test('rejects absent, staff, inactive and ambiguous identities',()=>{
 assert.equal(patientPortalView(workspace,null),null);
 assert.equal(patientPortalView(workspace,{role:'admin',patientId:'p1'}),null);
 assert.equal(patientPortalView({...workspace,patients:[{id:'p1',status:'Suspenso'}]},session),null);
 assert.equal(patientPortalView({...workspace,patients:[{id:'p1'},{id:'p1'}]},session),null);
});
test('checks both server file ownership and the live patient link',()=>{
 assert.equal(patientMayReadFile(workspace,session,{id:one,patient_id:'p1',mime:'image/jpeg'}),true);
 assert.equal(patientMayReadFile(workspace,session,{id:two,patient_id:'p2',mime:'video/mp4'}),false);
 assert.equal(patientMayReadFile(workspace,session,{id:two,patient_id:'p1',mime:'video/mp4'}),false);
 assert.equal(patientMayReadFile({...workspace,files:[]},session,{id:one,patient_id:'p1',mime:'image/jpeg'}),false);
 assert.equal(patientMayReadFile(workspace,session,{id:one,patient_id:'p1',mime:'application/pdf'}),false);
});
test('PDF documents obey the same live patient ownership as other media',()=>{
 const documents={...workspace,files:workspace.files.map(f=>({...f,type:'application/pdf'}))};
 assert.deepEqual(patientPortalView(documents,session).media.map(f=>f.id),[one]);
 assert.equal(patientMayReadFile(documents,session,{id:one,patient_id:'p1',mime:'application/pdf'}),true);
 assert.equal(patientMayReadFile(documents,session,{id:two,patient_id:'p2',mime:'application/pdf'}),false);
});
