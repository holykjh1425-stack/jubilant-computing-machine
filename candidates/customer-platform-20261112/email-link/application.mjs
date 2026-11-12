// UI state only. All authorization and verified-address selection remain on the server.
import {fail} from '../verified-email/service.mjs';
export function createLinkApplication({auth,intake,onChange=()=>{}}={}){
 let user=null,epoch=0,busy=false,key=null,payload=null,result=null;
 const state=()=>({authenticated:!!user,email:user?.email||'',busy,requestId:key,result});
 const notify=()=>onChange(state());
 function clear(){epoch++;user=null;busy=false;key=null;payload=null;result=null;notify()}
 async function verified(stamp){const current=await auth.identity();if(stamp!==epoch||!current?.emailConfirmed||!user||current.id!==user.id||current.email!==user.email)throw fail('AUTH_CHANGED');return current}
 async function run(fn){if(busy)throw fail('REQUEST_PENDING');const stamp=epoch;busy=true;notify();try{return await fn(stamp)}catch(e){if(stamp===epoch&&['AUTH_CHANGED','VERIFIED_EMAIL_REQUIRED','AUTH_REQUIRED'].includes(e.code))clear();throw e}finally{if(stamp===epoch){busy=false;notify()}}}
 return Object.freeze({state,clear,
  restore(){return run(async stamp=>{const current=await auth.identity();if(stamp!==epoch)throw fail('AUTH_CHANGED');if(!current?.emailConfirmed)throw fail('VERIFIED_EMAIL_REQUIRED');if(user&&(current.id!==user.id||current.email!==user.email)){clear();throw fail('AUTH_CHANGED')}user=current;notify();return state()})},
  submit(value){return run(async stamp=>{await verified(stamp);if(payload&&JSON.stringify(payload)!==JSON.stringify(value))throw fail('RECONCILE_BEFORE_EDIT');key||=crypto.randomUUID();payload||=structuredClone(value);const saved=await intake.submit({requestId:key,payload});
   await verified(stamp);if(saved?.applicationSaved!==true||!/^NX-\d{8}-[A-F0-9]{8}$/.test(saved.receiptNumber||''))throw fail('SAVE_UNCONFIRMED');result=saved;return saved})},
  reconcile(){return run(async stamp=>{await verified(stamp);if(!key)throw fail('NO_PENDING_REQUEST');const saved=await intake.status({requestId:key});await verified(stamp);result=saved;return saved})}
 });
}
