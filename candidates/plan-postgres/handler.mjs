// Edge-compatible candidate factory, not deployed; fixture-only DB adapter must be explicitly injected.
// No key, network/provider transport, automatic approvals, timers or production binding.
import {PLAN_STEPS} from '../../supabase/functions/nexus-orchestrator/engine.mjs';
export function createFixturePgHandler({isolated,authenticate,store}){
 if(isolated!==true)throw Error('isolated_only');
 return async request=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  try{
   const actor=await authenticate(request);
   if(!actor?.id)return reply({error:'authentication_required'},401);
   if(actor.admin!==true)return reply({error:'admin_required'},403);
   if(request.method!=='POST')return reply({error:'method_denied'},405);
   const text=await request.text();if(text.length>1024)return reply({error:'input_limit'},413);
   const body=JSON.parse(text);
   if(!body||Object.keys(body).some(k=>k!=='applicationId')||!/^SYNTH-[0-9]+$/.test(body.applicationId))return reply({error:'invalid_request'},400);
   // This scope callback is trusted server wiring; request body cannot declare ownership/approval.
   if(!await store.canRead(actor.id,body.applicationId))return reply({error:'scope_denied'},403);
   const stored=await store.generate({applicationId:body.applicationId,steps:[...PLAN_STEPS],annotation:{summary:'合成 fixture analysis',requiresReview:true,productionCompleted:false},usage:{input:15,output:4}});
   return reply({simulationOnly:true,...stored,actualProviderCalls:0,productionStarted:false});
  }catch{return reply({error:'store_failed_no_retry'},409);}
 };
}
