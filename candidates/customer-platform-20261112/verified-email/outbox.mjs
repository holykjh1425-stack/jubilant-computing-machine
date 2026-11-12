import {fail,normalizeEmail} from './service.mjs';
export function receiptMessage({recipient,receiptNumber}){
 recipient=normalizeEmail(recipient);if(!/^NX-\d{8}-[A-F0-9]{8}$/.test(receiptNumber||''))throw fail('INVALID_RECEIPT');
 return {to:recipient,subject:'SOLQ 신청 접수 확인',text:`SOLQ 신청이 접수되었습니다.\n접수번호: ${receiptNumber}\n\nhttps://solqtech.com 에서 인증된 이메일로 로그인한 뒤 내 신청을 확인해 주세요.\n접수번호와 이름만으로 조회 권한을 제공하지 않습니다.\n제작은 견적 동의·입금 확인·별도 제작 승인 후 진행됩니다.`,classification:'transactional_receipt'};
}
export function createReceiptDispatcher({enabled=false,synthetic=false,deliveryApproved=false,costApproved=false,store,provider}={}){
 return {async tick(){if(!enabled||!store||!provider||!synthetic&&(!deliveryApproved||!costApproved))throw fail('NOT_DEPLOYED');
  const job=await store.claim();if(!job)return {started:false};if(!await store.confirm(job))return {started:false,state:'cancelled'};let outcome='unknown',reference=null;
  try{const reply=await provider.send({...receiptMessage(job),idempotencyKey:job.id});
   if(reply?.accepted===true){outcome='accepted';reference=typeof reply.reference==='string'?reply.reference:null}
   else if(reply?.definitelyNotAccepted===true)outcome='failed';
  }catch{outcome='unknown'}
  // Provider acceptance is NOT inbox delivery. Ambiguous result is never auto-retried.
  await store.finish({id:job.id,lease:job.lease,result:outcome,reference});return {started:true,state:outcome};
 }};
}
export function createOutboxStore({enabled=false,serverDb}={}){
 const rpc=async(name,args)=>{if(!enabled||!serverDb)throw fail('NOT_DEPLOYED');const {data,error}=await serverDb.rpc(name,args);if(error)throw fail('OUTBOX_UNCONFIRMED');return data};
 return {claim:()=>rpc('solq_claim_receipt',{}),confirm:r=>rpc('solq_confirm_receipt_destination',{p_id:r.id,p_lease:r.lease}),finish:r=>rpc('solq_finish_receipt',{p_id:r.id,p_lease:r.lease,p_result:r.result,p_reference:r.reference})};
}
