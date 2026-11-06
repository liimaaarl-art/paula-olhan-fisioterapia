import { getAuth, normalizeEmail, adminSession } from './auth.js';
import { db } from './db.js';
import { COLLABORATORS, collaboratorContext } from './collaborator-access.mjs';

export async function collaboratorSession(headers, auth=getAuth(), sqlFactory=db) {
 const session=await auth.api.getSession({headers});
 if(!session?.user||session.user.role!=='collaborator'||!session.user.emailVerified||!session.user.twoFactorEnabled)return null;
 const email=normalizeEmail(session.user.email);if(!COLLABORATORS[email])return null;
 const rows=await sqlFactory()`SELECT data FROM public.olhan_workspace WHERE id='olhan'`;
 if(!rows[0]?.data)return null;
 try{const c=collaboratorContext(rows[0].data,email);return {...session,teamId:c.teamId,permissions:c.account.permissions};}catch{return null;}
}
export async function collaboratorOrAdminSession(headers,auth=getAuth()) {
 const admin=await adminSession(headers,auth);if(admin)return admin;
 return collaboratorSession(headers,auth);
}
export async function validCollaboratorAccount(auth,email,sqlFactory=db) {
 email=normalizeEmail(email);if(!COLLABORATORS[email])return false;
 const rows=await sqlFactory()`SELECT data FROM public.olhan_workspace WHERE id='olhan'`;
 if(!rows[0]?.data)return false;
 try{collaboratorContext(rows[0].data,email);return true;}catch{return false;}
}
export async function ensureCollaboratorAccount(auth,email) {
 email=normalizeEmail(email);const config=COLLABORATORS[email];if(!config)throw Error('COLLABORATOR_NOT_ALLOWED');
 const ctx=await auth.$context;let found=await ctx.internalAdapter.findUserByEmail(email);
 if(found){if(found.user.role==='admin'||found.user.role==='support')throw Error('RESERVED_ACCOUNT');if(found.user.role!=='collaborator')await ctx.internalAdapter.updateUser(found.user.id,{role:'collaborator',twoFactorEnabled:true});return;}
 try{await ctx.internalAdapter.createUser({email,name:config.name,emailVerified:false,role:'collaborator',twoFactorEnabled:true});}
 catch(error){found=await ctx.internalAdapter.findUserByEmail(email);if(!found)throw error;if(found.user.role==='admin'||found.user.role==='support')throw Error('RESERVED_ACCOUNT');await ctx.internalAdapter.updateUser(found.user.id,{role:'collaborator',twoFactorEnabled:true});}
}
export async function validLoginIdentity(auth,email,adminEmail,supportEmail) {
 const {reservedRole,normalizeEmail:normalize}=await import('./auth.js');
 email=normalize(email);const expected=reservedRole(email,adminEmail,supportEmail)||(COLLABORATORS[email]?'collaborator':null);if(!expected)return false;
 const ctx=await auth.$context;const row=await ctx.internalAdapter.findUserByEmail(email);if(row?.user.role!==expected)return false;
 return expected!=='collaborator'||validCollaboratorAccount(auth,email);
}
