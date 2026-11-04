import test from 'node:test';
import assert from 'node:assert/strict';
import {makePatientHandler} from '../lib/patient-service.js';
import {identityKey} from '../lib/patient-security.js';
const secret='profile-test-secret-'.repeat(3),photo='11111111-1111-4111-8111-111111111111',pdf='22222222-2222-4222-8222-222222222222';
function setup(){
 const workspace={patients:[{id:'p1',name:'Teste',cpf:'52998224725',birth:'1990-01-01',status:'Ativo'}],files:[{id:photo,patient:'p1',name:'Foto',type:'image/jpeg',data:'/api/files?id='+photo},{id:pdf,patient:'p1',name:'PDF',type:'application/pdf',data:'/api/files?id='+pdf}],records:[],appointments:[]};
 const account={patient_id:'p1',cpf_key:identityKey('52998224725',secret),active:true,epoch:0};const writes=[];
 const sql=async(strings,...values)=>{const q=strings.join('?');if(q.includes('SELECT a.*'))return [account];if(q.includes('SELECT data'))return [{data:workspace}];if(q.includes('olhan_patient_rates'))return [{hits:1}];if(q.includes('SET avatar_file_id')){writes.push(values);account.avatar_file_id=values[0];return [{patient_id:'p1'}];}throw Error('Unexpected SQL');};
 const handler=makePatientHandler({sqlFactory:()=>sql,secret,getAdmin:async()=>null,fileUrl:async(_,id)=>id===photo?'https://example.invalid/photo':null});
 async function call(body,cookie=true,origin='https://portal.test'){let status,payload;const res={setHeader(){return this},status(v){status=v;return this},end(v){payload=JSON.parse(v)}};await handler({method:body?'POST':'GET',body,query:{},headers:{host:'portal.test',origin,'content-type':'application/json',cookie:cookie?'__Host-olhan-patient='+'x'.repeat(43):''}},res);return {status,payload};}
 return {call,writes};
}
test('profile change requires a live session, same origin and an owned image',async()=>{
 const {call,writes}=setup();
 assert.equal((await call({action:'set-avatar',fileId:photo},false)).status,401);
 assert.equal((await call({action:'set-avatar',fileId:photo},true,'https://other.test')).status,403);
 assert.equal((await call({action:'set-avatar',fileId:pdf})).status,404);
 assert.equal((await call({action:'set-avatar',fileId:'33333333-3333-4333-8333-333333333333'})).status,404);
 assert.equal(writes.length,0);
 assert.equal((await call({action:'set-avatar',fileId:photo})).status,200);
 assert.equal((await call()).payload.avatarFileId,photo);
 assert.equal(writes[0][1],'p1');
 assert.equal((await call({action:'set-avatar',fileId:null})).status,200);
});
test('patient endpoint does not permit editing appointments',async()=>{
 const {call,writes}=setup();for(const action of ['update-appointment','cancel-appointment','reschedule'])assert.equal((await call({action,patientId:'another'})).status,404);assert.equal(writes.length,0);
});
