/* Explicit approval/generation only. inspect never creates work. */
(function(root){'use strict';
function createFreeGeneration({db,verifyAdmin}){
 const pending=new Set();
 async function call(action,a,view,alive=()=>true){
  if(!alive())throw Error('STALE_VIEW');
  if(action!=='inspect'&&pending.has(a.id))throw Error('BUSY');
  if(action!=='inspect')pending.add(a.id);
  try{
   const actor=await verifyAdmin();if(!alive())throw Error('STALE_VIEW');
   if(action!=='inspect'&&(!view||view.application_id!==a.id||!/^[a-f0-9]{32}$/.test(view.request_hash)))throw Error('REFRESH_REQUIRED');
   const {data:current,error:authError}=await db.auth.getUser();
   if(authError||current.user?.id!==actor.id||!alive())throw Error('SESSION_CHANGED');
   const {data,error}=await db.rpc('solq_free_generation',{
    p_action:action,p_application:a.id,p_expected_hash:action==='inspect'?null:view.request_hash
   });
   if(error)throw Object.assign(Error('FREE_GENERATION_FAILED'),{code:error.code});
   if(!alive())throw Error('STALE_VIEW');
   if(!data||data.application_id!==a.id)throw Error('RESPONSE_MISMATCH');
   return data;
  }finally{if(action!=='inspect')pending.delete(a.id);}
 }
 return {inspect:(a,alive)=>call('inspect',a,null,alive),
  approve:(a,v,alive)=>call('approve',a,v,alive),
  generate:(a,v,alive)=>call('generate',a,v,alive)};
}
root.createFreeGeneration=createFreeGeneration;
})(typeof window==='undefined'?globalThis:window);
