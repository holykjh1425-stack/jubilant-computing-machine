// In-memory form state. Adapters are injected; no global SDK or legacy submit fallback.
import {fail,normalizeEmail} from './service.mjs';
export function createApplicationClient({auth,intake,onChange=()=>{}}={}){
 let epoch=0,user=null,email='',challenge=false,requestId=null,frozen=null,flight=false,result=null,stage='email';
 const state=()=>({stage,email:user?.email||email,canWrite:!!user&&!flight,requestId,result,busy:flight});
 const notify=()=>onChange(state());
 function clear(){epoch++;user=null;email='';challenge=false;requestId=null;frozen=null;result=null;flight=false;stage='email';notify()}
 async function perform(fn){if(flight)throw fail('REQUEST_PENDING');flight=true;const stamp=epoch;notify();try{const value=await fn(stamp);if(stamp!==epoch)throw fail('AUTH_CHANGED');return value}catch(e){if(e?.code==='AUTH_CHANGED'&&stamp===epoch)clear();throw e}finally{if(stamp===epoch){flight=false;notify()}}}
 return {state,clear,
  requestCode(value){return perform(async stamp=>{const normalized=normalizeEmail(value);await auth.request(normalized);if(stamp!==epoch)throw fail('AUTH_CHANGED');email=normalized;challenge=true;stage='code';notify()})},
  verifyCode(code){return perform(async stamp=>{if(!challenge)throw fail('CODE_NOT_REQUESTED');const identity=await auth.verify(email,code);if(stamp!==epoch)throw fail('AUTH_CHANGED');if(!identity?.emailConfirmed||normalizeEmail(identity.email)!==email)throw fail('VERIFIED_EMAIL_REQUIRED');user={...identity,email:normalizeEmail(identity.email)};stage='application';notify()})},
  submit(payload){return perform(async stamp=>{if(!user)throw fail('AUTH_REQUIRED');const current=await auth.identity();if(stamp!==epoch||current.id!==user.id||normalizeEmail(current.email)!==user.email)throw fail('AUTH_CHANGED');if(frozen&&JSON.stringify(frozen)!==JSON.stringify(payload))throw fail('RECONCILE_BEFORE_EDIT');requestId||=crypto.randomUUID();frozen||=structuredClone(payload);
   try{const saved=await intake.submit({requestId,payload:frozen});if(stamp!==epoch)throw fail('AUTH_CHANGED');result=saved;stage='saved';return saved}catch(e){if(stamp===epoch)stage='uncertain';throw e}
  })},
  reconcile(){return perform(async stamp=>{if(!user||!requestId)throw fail('NO_PENDING_REQUEST');const current=await auth.identity();if(stamp!==epoch||current.id!==user.id||normalizeEmail(current.email)!==user.email)throw fail('AUTH_CHANGED');const saved=await intake.status({requestId});if(stamp!==epoch)throw fail('AUTH_CHANGED');if(saved){result=saved;stage='saved'}return saved})}
 };
}
