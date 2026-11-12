import {fail,normalizeEmail} from '../verified-email/service.mjs';
export const SENDER=Object.freeze({email:'ggwell06@gmail.com',name:'SOLQ'});
// readCompletion MUST read trusted contract/job/preview rows; never request JSON or an LLM claim.
export function createCompletionBridge({enabled=false,readCompletion,store}={}){
 return {async enqueue({caseId,version,kind}){
  if(!enabled||!readCompletion||!store)throw fail('NOT_DEPLOYED');
  if(!['production_completed','revision_completed'].includes(kind)||!Number.isSafeInteger(version)||version<1)throw fail('INVALID_EVENT');
  const e=await readCompletion({caseId,version,kind});
  if(!e||e.caseId!==caseId||e.version!==version||e.kind!==kind||e.status!=='completed'||e.validation!=='PASS'||e.accessValidated!==true||e.quoteAccepted!==true||e.depositConfirmed!==true||e.productionApproved!==true||e.cancelled!==false||!e.depositConfirmedBy||!e.productionApprovedBy||kind==='revision_completed'&&e.revisionWithinScope!==true)throw fail('COMPLETION_NOT_VERIFIED');
  // recipient, user ID and receipt are NEVER passed in from the event caller.
  return store.enqueue({caseId,version,kind,depositBy:e.depositConfirmedBy,productionBy:e.productionApprovedBy,contractRevision:e.contractRevision,quoteAccepted:true,revisionWithinScope:e.revisionWithinScope===true});
 }};
}
export function completionMessage({recipient,receiptNumber,version,kind}){
 const to=normalizeEmail(recipient);if(!/^NX-\d{8}-[A-F0-9]{8}$/.test(receiptNumber||'')||!Number.isSafeInteger(version)||version<1||!['production_completed','revision_completed'].includes(kind))throw fail('INVALID_EVENT');
 const label=kind==='production_completed'?'제작':'수정';
 return {from:SENDER,to,subject:'SOLQ '+label+' 결과 확인 안내',text:'신청 '+receiptNumber+'의 '+label+' 결과(버전 '+version+')가 검증되었습니다.\nhttps://solqtech.com 에서 인증된 이메일로 로그인해 결과를 확인해 주세요.\n실제 홈페이지 공개 배포와는 별개입니다.',classification:'transactional_completion'};
}
export function createCompletionDispatcher({enabled=false,synthetic=false,deliveryApproved=false,costApproved=false,store,provider,reserveBudget,authorizeCurrent}={}){
 let busy=false;
 return {async tick(){
  if(!enabled||!store||!provider||!reserveBudget||!authorizeCurrent||!synthetic&&(!deliveryApproved||!costApproved))throw fail('NOT_DEPLOYED');
  if(busy)throw fail('REQUEST_PENDING');busy=true;
  try{const job=await store.claim();if(!job)return {started:false};
   // Shared budget reservation includes receipts, completions, retries; Auth provider quota is separate.
   if(!await reserveBudget(job)){await store.finish({...job,result:'failed',reference:null});return {started:false,state:'budget_blocked'}}
   if(!await authorizeCurrent(job)){await store.finish({...job,result:'cancelled',reference:null});return {started:false,state:'cancelled'}}
   if(!await store.confirm(job))return {started:false,state:'cancelled'};
   let result='unknown';
   try{const reply=await provider.send({...completionMessage(job),idempotencyKey:job.id});if(reply?.accepted===true)result='accepted';else if(reply?.definitelyNotAccepted===true)result='failed'}catch{}
   // Never store arbitrary provider response/headers or secrets. Accepted != inbox delivered.
   await store.finish({...job,result,reference:null});return {started:true,state:result};
  }finally{busy=false}
 }};
}
export function createCompletionStore({enabled=false,serverDb}={}){
 const rpc=async(name,args)=>{if(!enabled||!serverDb)throw fail('NOT_DEPLOYED');const {data,error}=await serverDb.rpc(name,args);if(error)throw fail('COMPLETION_STORE_UNCONFIRMED');return data};
 return {enqueue:e=>rpc('solq_queue_completion',{p_case:e.caseId,p_version:e.version,p_kind:e.kind,p_deposit_by:e.depositBy,p_production_by:e.productionBy,p_contract_revision:e.contractRevision,p_quote_accepted:e.quoteAccepted,p_revision_scope:e.revisionWithinScope}),
  claim:()=>rpc('solq_claim_completion',{}),confirm:j=>rpc('solq_confirm_completion',{p_id:j.id,p_lease:j.lease}),
  finish:j=>rpc('solq_finish_completion',{p_id:j.id,p_lease:j.lease,p_result:j.result})};
}
