// Preparation only. No timer, network connection, secret access, or production entrypoint.
import {fail} from '../verified-email/service.mjs';
import {createReceiptDispatcher} from '../verified-email/outbox.mjs';
import {createCompletionDispatcher} from './notifications.mjs';
import {createSmtpProvider} from './smtp-provider.mjs';

export function createMailWorker({enabled=false,synthetic=false,smtpApproved=false,deliveryApproved=false,costApproved=false,transport,receiptStore,completionStore,reserveBudget,authorizeCurrent}={}){
 if(!enabled||!transport||!receiptStore||!completionStore||typeof reserveBudget!=='function'||typeof authorizeCurrent!=='function'||!synthetic&&(!smtpApproved||!deliveryApproved||!costApproved))throw fail('NOT_DEPLOYED');
 const provider=createSmtpProvider({enabled,synthetic,smtpApproved,deliveryApproved,costApproved,transport});
 // reserveBudget must be a durable atomic server reservation shared by all worker instances.
 // Auth mail uses its own provider path; include its allowance in the overall Gmail budget.
 const guardedReceipts={
  async claim(){
   const job=await receiptStore.claim();if(!job)return null;
   if(!await reserveBudget(job)){await receiptStore.finish({...job,result:'failed',reference:null});return null}
   return job;
  },
  confirm:job=>receiptStore.confirm(job),finish:result=>receiptStore.finish(result)
 };
 const receipt=createReceiptDispatcher({enabled,synthetic,deliveryApproved,costApproved,store:guardedReceipts,provider});
 const completion=createCompletionDispatcher({enabled,synthetic,deliveryApproved,costApproved,store:completionStore,provider,reserveBudget,authorizeCurrent});
 let busy=false;
 return Object.freeze({async tick(kind){
  if(!['receipt','completion'].includes(kind))throw fail('INVALID_EVENT');
  if(busy)throw fail('REQUEST_PENDING');busy=true;
  try{return await (kind==='receipt'?receipt:completion).tick()}finally{busy=false}
 }});
}
