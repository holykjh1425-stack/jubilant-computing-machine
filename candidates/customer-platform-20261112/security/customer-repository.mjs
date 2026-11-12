// Candidate SDK adapter. Default disabled; no registration, password reset or unauthenticated lookup.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>Object.assign(new Error(code),{code});
export function createCustomerRepository({db,enabled=false,clock=()=>Date.now()}){
 let deadline=0,generation=0;
 function configured(){if(!enabled||!db)throw fail('NOT_DEPLOYED')}
 async function verify(){configured();const stamp=generation;if(deadline&&deadline<=clock())throw fail('AUTH_EXPIRED');
  const {data:sessionData,error:sessionError}=await db.auth.getSession();const session=sessionData?.session;
  if(sessionError||!session||typeof session.access_token!=='string'||session.access_token.length<20||!Number.isFinite(session.expires_at)||session.expires_at*1000<=clock())throw fail('AUTH_REQUIRED');
  const {data,error}=await db.auth.getUser(session.access_token);const user=data?.user;
  if(error||!UUID.test(user?.id||'')||user.id!==session.user?.id)throw fail('AUTH_REQUIRED');
  // Unverified identities must not bind to existing applications.
  if(!user.email_confirmed_at&&!user.phone_confirmed_at)throw fail('VERIFIED_IDENTITY_REQUIRED');
  const {data:active,error:checkError}=await db.rpc('solq_customer_session_active');
  const latest=await db.auth.getSession();
  if(checkError||active!==true)throw fail('SESSION_REVOKED');
  if(stamp!==generation||latest.error||latest.data?.session?.user?.id!==user.id||latest.data?.session?.access_token!==session.access_token)throw fail('AUTH_CHANGED');
  if(session.expires_at*1000<=clock())throw fail('AUTH_EXPIRED');deadline=session.expires_at*1000;return {...user,expiresAt:deadline};
 }
 async function stable(user,stamp){const current=await verify();if(stamp!==generation||current.id!==user.id)throw fail('AUTH_CHANGED');}
 async function admin(){const user=await verify();const {data,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error||data?.user_id!==user.id)throw fail('ADMIN_REQUIRED');return user;}
 async function ownedCase(caseId){if(!UUID.test(caseId||''))throw fail('INVALID_CASE');const user=await verify();
  const {data,error}=await db.from('solq_customer_cases').select('id,application_id,account_id').eq('id',caseId).eq('account_id',user.id).maybeSingle();
  if(error||!data)throw fail('FORBIDDEN');return {user,case:data};
 }
 async function readOwn(table,columns,caseId,order='created_at'){
  const stamp=generation;await ownedCase(caseId);const {data,error,count}=await db.from(table).select(columns,{count:'exact'}).eq('case_id',caseId).order(order,{ascending:false}).limit(100);
  if(error)throw fail('READ_FAILED');await ownedCase(caseId);if(stamp!==generation)throw fail('AUTH_CHANGED');return {items:data,total:count,complete:data.length===count};
 }
 const api={verify,subscribeInvalidation(listener){configured();if(typeof listener!=='function'||!db.auth.onAuthStateChange)throw fail('AUTH_EVENTS_REQUIRED');const {data}=db.auth.onAuthStateChange(()=>{generation++;deadline=0;queueMicrotask(listener)});return ()=>data?.subscription?.unsubscribe();},clear(){generation++;deadline=0;},
  async listCases(){const stamp=generation,user=await verify();const {data,error,count}=await db.from('solq_customer_cases').select('id,application_id,created_at',{count:'exact'}).eq('account_id',user.id).order('created_at',{ascending:false}).limit(100);if(error)throw fail('READ_FAILED');const reverified=await verify();if(stamp!==generation||reverified.id!==user.id)throw fail('AUTH_CHANGED');return {items:data,total:count,complete:data.length===count};},
  listMessages:caseId=>readOwn('solq_customer_messages','id,case_id,role,content,created_at',caseId),
  listRequests:caseId=>readOwn('solq_customer_requests','id,case_id,kind,message,expected_version,status,created_at',caseId),
  listPreviews:caseId=>readOwn('solq_customer_previews','id,case_id,version,state,validation_summary,created_at',caseId),
  async setChatConsent(caseId,accepted){if(typeof accepted!=='boolean')throw fail('INVALID_CONSENT');const stamp=generation,{user}=await ownedCase(caseId);const {data,error}=await db.from('solq_customer_consent_events').insert({case_id:caseId,actor_id:user.id,accepted,policy_version:'chat-v1'}).select('id,accepted,created_at').single();if(error)throw fail('WRITE_FAILED');await stable(user,stamp);return data;},
  async appendMessage(caseId,content,{clientMessageId=crypto.randomUUID()}={}){if(typeof content!=='string'||!content.trim()||content.length>6000||!UUID.test(clientMessageId))throw fail('INVALID_MESSAGE');const stamp=generation,{user}=await ownedCase(caseId);const {data,error}=await db.from('solq_customer_messages').insert({case_id:caseId,actor_id:user.id,role:'customer',content:content.trim(),client_message_id:clientMessageId}).select('id,role,content,created_at').single();if(error)throw fail(error.code==='23505'?'DUPLICATE_MESSAGE':'CONSENT_OR_WRITE_DENIED');await stable(user,stamp);return data;},
  async requestRevision(caseId,{message,expectedVersion,clientRequestId=crypto.randomUUID()}){if(typeof message!=='string'||!message.trim()||message.length>3000||!Number.isInteger(expectedVersion)||expectedVersion<0||!UUID.test(clientRequestId))throw fail('INVALID_REVISION');const stamp=generation,{user}=await ownedCase(caseId);const {data,error}=await db.from('solq_customer_requests').insert({case_id:caseId,actor_id:user.id,kind:'revision',message:message.trim(),expected_version:expectedVersion,client_request_id:clientRequestId,status:'received'}).select('id,status,created_at').single();if(error)throw fail(error.code==='23505'?'DUPLICATE_REQUEST':'CONSENT_OR_WRITE_DENIED');await stable(user,stamp);return data;},
  async readArtifact(caseId,version){if(!Number.isInteger(version)||version<1)throw fail('INVALID_VERSION');const stamp=generation;await ownedCase(caseId);const {data,error}=await db.from('solq_customer_artifacts').select('id,case_id,version,path,content,sha256').eq('case_id',caseId).eq('version',version).order('path',{ascending:true}).limit(2);if(error||!data?.length)throw fail('ARTIFACT_UNAVAILABLE');await ownedCase(caseId);if(stamp!==generation)throw fail('AUTH_CHANGED');return data;},
  async createCase({applicationId,accountId,verificationReference}){if(!UUID.test(applicationId||'')||!UUID.test(accountId||'')||typeof verificationReference!=='string'||!verificationReference.trim()||verificationReference.length>500)throw fail('VERIFIED_LINK_REQUIRED');const stamp=generation,user=await admin();const {data,error}=await db.from('solq_customer_cases').insert({application_id:applicationId,account_id:accountId,verification_reference:verificationReference.trim(),created_by:user.id}).select('id,application_id,account_id,created_at').single();if(error)throw fail('CASE_PROVISION_DENIED');await stable(user,stamp);return data;}
 };
 return Object.freeze(api);
}
