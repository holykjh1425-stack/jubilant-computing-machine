// Server-only candidate. No live endpoint, email, token issuance or database mutation is performed by importing this file.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const fail=code=>Object.assign(new Error(code),{code});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const randomProof=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
const validIssue=r=>r&&/^[a-f0-9]{64}$/.test(r.proofHash)&&UUID.test(r.applicationId)&&UUID.test(r.accountId)&&typeof r.receiptNumber==='string'&&r.receiptNumber.length<=100&&r.purpose==='solq_customer_enrollment'&&Number.isFinite(r.expiresAt);
export function createEnrollmentLifecycle({enabled=false,authenticate,submitIntake,store,clock=()=>Date.now(),ttlMs=300000}={}){
 if(!Number.isInteger(ttlMs)||ttlMs<30000||ttlMs>900000)throw fail('INVALID_TTL');
 const active=()=>{if(!enabled||!authenticate||!store)throw fail('NOT_DEPLOYED')};
 async function identity(authorization){active();if(typeof authorization!=='string'||!/^Bearer [^\s]{20,8192}$/.test(authorization))throw fail('AUTH_REQUIRED');const user=await authenticate(authorization);if(!UUID.test(user?.id||'')||!Number.isFinite(user.expiresAt)||user.expiresAt<=clock())throw fail('AUTH_REQUIRED');if(!user.emailConfirmed&&!user.phoneConfirmed)throw fail('VERIFIED_IDENTITY_REQUIRED');return user;}
 return Object.freeze({
  async submitAndIssue({authorization,application}){
   const user=await identity(authorization);if(!submitIntake)throw fail('INTAKE_NOT_CONNECTED');
   // Only approved intake fields cross this boundary. Internal IDs/ownership are never accepted from the browser.
   const allowed=['customer_name','contact','service_type','description','privacy_consent','transfer_consent','submission_id'];
   if(!application||typeof application!=='object'||Array.isArray(application)||Object.keys(application).some(k=>!allowed.includes(k))||application.privacy_consent!==true||application.transfer_consent!==true||!UUID.test(application.submission_id||''))throw fail('INVALID_INTAKE');
   // submitIntake is a trusted SERVER dependency bound to the existing intake implementation.
   // It must validate/rate-limit/idempotently persist intake and return authoritative internal ID + receipt.
   const intake=await submitIntake({application,authenticatedAccountId:user.id});
   if(!UUID.test(intake?.applicationId||'')||typeof intake.receiptNumber!=='string'||!intake.receiptNumber||intake.receiptNumber.length>100)throw fail('INTAKE_PROOF_UNAVAILABLE');
   const current=await identity(authorization);if(current.id!==user.id||current.sessionId!==user.sessionId)throw fail('AUTH_CHANGED');
   const proof=randomProof(),expiresAt=Math.min(clock()+ttlMs,user.expiresAt);
   if(expiresAt-clock()<30000)throw fail('AUTH_NEAR_EXPIRY');
   await store.issue({proofHash:await hash(proof),applicationId:intake.applicationId,accountId:user.id,receiptNumber:intake.receiptNumber,purpose:'solq_customer_enrollment',expiresAt,...(user.sessionId?{sessionId:user.sessionId}:{})});
   // Raw proof is returned once and never stored/logged. UI must keep it in memory and exchange promptly.
   return {receiptNumber:intake.receiptNumber,enrollmentProof:proof,expiresAt};
  },
  async exchange({authorization,receiptNumber,enrollmentProof}){
   const user=await identity(authorization);if(typeof receiptNumber!=='string'||receiptNumber.length>100||!TOKEN.test(enrollmentProof||''))throw fail('PROOF_DENIED');
   // The store performs one atomic consume + case binding transaction. No precheck-then-consume race.
   const linked=await store.exchange({proofHash:await hash(enrollmentProof),accountId:user.id,receiptNumber,sessionId:user.sessionId,now:clock()});
   if(!linked||!UUID.test(linked.caseId||''))throw fail('PROOF_DENIED');return {caseId:linked.caseId,linked:true};
  }
 });
}
export function createMemoryEnrollmentStore({clock=()=>Date.now()}={}){
 // Isolated test model: one process, globally serialized exchanges; not a distributed production store.
 const proofs=new Map(),cases=new Map();let tail=Promise.resolve();
 const exclusive=fn=>{const p=tail.then(fn,fn);tail=p.catch(()=>{});return p};
 return Object.freeze({
  async issue(record){if(!validIssue(record)||record.expiresAt<=clock()||record.expiresAt>clock()+900000||Object.keys(record).sort().join(',')!==(record.sessionId?'accountId,applicationId,expiresAt,proofHash,purpose,receiptNumber,sessionId':'accountId,applicationId,expiresAt,proofHash,purpose,receiptNumber')||record.sessionId&&!UUID.test(record.sessionId))throw fail('INVALID_ISSUE');if(proofs.has(record.proofHash))throw fail('DUPLICATE_PROOF');proofs.set(record.proofHash,{...record,consumedAt:null});},
  exchange(input){return exclusive(async()=>{const r=proofs.get(input.proofHash);if(!r||r.accountId!==input.accountId||r.receiptNumber!==input.receiptNumber||r.sessionId&&r.sessionId!==input.sessionId||r.consumedAt!==null||r.expiresAt<=clock())return null;const previous=cases.get(r.applicationId);if(previous&&previous.accountId!==input.accountId)throw fail('ALREADY_BOUND');const binding=previous||{caseId:crypto.randomUUID(),applicationId:r.applicationId,accountId:r.accountId};cases.set(r.applicationId,binding);r.consumedAt=clock();return {caseId:binding.caseId};})},
  snapshotForTest(){return {proofs:[...proofs.values()].map(x=>({...x})),cases:[...cases.values()].map(x=>({...x}))}}
 });
}
export function createServerEnrollmentStore({serverDb,enabled=false}={}){
 // Construct only in an existing trusted server runtime, with its existing server authority.
 // Never pass this client/authority to a browser. The RPCs are denied to anon/authenticated.
 const configured=()=>{if(!enabled||!serverDb)throw fail('NOT_DEPLOYED')};
 return Object.freeze({
  async issue(r){configured();if(!validIssue(r)||!UUID.test(r.sessionId||''))throw fail('INVALID_ISSUE');const {error}=await serverDb.rpc('solq_issue_customer_enrollment_v2',{p_proof_hash:r.proofHash,p_application_id:r.applicationId,p_account_id:r.accountId,p_receipt_number:r.receiptNumber,p_expires_at:new Date(r.expiresAt).toISOString(),p_session_id:r.sessionId});if(error)throw fail('ISSUE_NOT_COMPLETED');},
  async exchange(r){configured();if(!UUID.test(r.sessionId||''))throw fail('AUTH_REQUIRED');const {data,error}=await serverDb.rpc('solq_exchange_customer_enrollment_v2',{p_proof_hash:r.proofHash,p_account_id:r.accountId,p_receipt_number:r.receiptNumber,p_session_id:r.sessionId});if(error)throw fail('EXCHANGE_NOT_COMPLETED');return data;}
 });
}
