// Candidate boundary only. No Supabase import, key accessor, SDK, fetch or provider transport.
export async function handler(request){
 if(request.method==='GET')return new Response(JSON.stringify({mode:'simulation_only',liveEnabled:false,keyValidity:'unverified',paidCallsAllowed:false,productionApproved:false}),{headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({error:'live_adapter_absent',executionStarted:false}),{status:403,headers:{'Content-Type':'application/json'}});
}
