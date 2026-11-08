/* Narrow quote-evidence client. No automatic writes or production-start command. */
(function(root){'use strict';
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
 function createQuoteFlow({db,now=()=>Date.now()}){
  let epoch=0;
  const invalidate=()=>{epoch++;};
  async function admin(){const {data,error}=await db.auth.getUser();if(error||!uuid(data?.user?.id))throw Error('AUTH');const id=data.user.id;const r=await db.from('admin_users').select('user_id').eq('user_id',id).maybeSingle();if(r.error||r.data?.user_id!==id)throw Error('NOT_ADMIN');return id;}
  async function invoke(body){const r=await db.functions.invoke('solq-quote-evidence',{body});if(r.error||r.data?.error||!r.data)throw Error('QUOTE_API');return r.data;}
  async function current(c){if(c.epoch!==epoch)throw Error('STALE_VIEW');const id=await admin();if(c.epoch!==epoch||id!==c.userId)throw Error('STALE_SESSION');}
  async function read(receipt){const stamp=++epoch,userId=await admin();const r=await db.from('applications').select('id,receipt_number').eq('receipt_number',receipt.trim().toUpperCase()).single();if(r.error||!uuid(r.data?.id))throw Error('APPLICATION');
   const a=r.data,s=await invoke({action:'list',application_id:a.id});if(stamp!==epoch)throw Error('STALE_VIEW');
   if(s.application_id!==a.id||!['quotes','evidence','deposits','confirmations'].every(k=>Array.isArray(s[k])))throw Error('LINK_MISMATCH');
   for(const key of ['quotes','evidence','deposits'])if(s[key].some(row=>row.application_id!==a.id))throw Error('LINK_MISMATCH');
   const quotes=[...s.quotes].sort((x,y)=>y.version-x.version),quote=quotes[0]||null;
   if(quote&&(!uuid(quote.id)||!Number.isSafeInteger(Number(quote.amount_krw))||Number(quote.amount_krw)<30000||!Number.isInteger(quote.version)||!Number.isFinite(Date.parse(quote.expires_at))))throw Error('INVALID_QUOTE');
   for(const c of s.confirmations)if(!s.deposits.some(d=>d.id===c.deposit_id))throw Error('LINK_MISMATCH');
   const c={epoch:stamp,userId,application_id:a.id,receipt_number:a.receipt_number,quote,snapshot:{...s,quotes}};await current(c);return c;
  }
  async function write(c,action,input={}){
   await current(c);const body={action,application_id:c.application_id};const q=c.quote;
   const text=(k,max=1000)=>{const v=String(input[k]||'').trim();if(!v||v.length>max)throw Error('INVALID_'+k);return v;};
   if(action==='issue_quote'){body.quote_reference=text('quote_reference',200);body.amount_krw=Number(input.amount_krw);body.expires_at=text('expires_at');if(!Number.isSafeInteger(body.amount_krw)||body.amount_krw<30000||!(Date.parse(body.expires_at)>now()))throw Error('INVALID_QUOTE');}
   else {
    if(!q||Date.parse(q.expires_at)<=now())throw Error('EXPIRED_QUOTE');
    if(action==='record'){if(input.evidence_verified!==true)throw Error('EVIDENCE_REQUIRED');Object.assign(body,{quote_reference:q.quote_reference,quote_version:String(q.version),amount_krw:q.amount_krw,accepted:true,evidence_verified:true,accepted_at:text('accepted_at'),evidence_reference:text('evidence_reference')});if(!(Date.parse(body.accepted_at)>=Date.parse(q.issued_at)&&Date.parse(body.accepted_at)<=now()&&Date.parse(body.accepted_at)<Date.parse(q.expires_at)))throw Error('INVALID_ACCEPTANCE_TIME');}
    else if(action==='record_deposit'){Object.assign(body,{quote_id:q.id,amount_krw:30000,paid_at:text('paid_at'),transaction_reference:text('transaction_reference',200),evidence_reference:text('evidence_reference')});if(!Number.isFinite(Date.parse(body.paid_at))||Date.parse(body.paid_at)>now())throw Error('INVALID_PAYMENT_TIME');}
    else if(action==='confirm_deposit'){if(input.bank_verified!==true||!c.snapshot.deposits.some(d=>d.id===input.deposit_id&&d.quote_id===q.id))throw Error('DEPOSIT_REQUIRED');Object.assign(body,{quote_id:q.id,deposit_id:input.deposit_id,bank_verified:true});}
    else throw Error('UNSUPPORTED_ACTION');
   }
   await current(c); // Identity checked again after validation; server/DB remain authoritative.
   const pending=invoke(body);invalidate();return pending;
  }
  return {read,write,invalidate};
 }
 root.createQuoteFlow=createQuoteFlow;
})(typeof window==='undefined'?globalThis:window);
