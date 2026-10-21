// Narrow machine identity: only the previously authorized global one-attempt synthetic Claude test.
export const MODEL='claude-haiku-5-5';
export function createHandler({url,serviceKey,fetchFn=fetch}){
 const reply=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 async function db(path,body,method='POST'){
  const r=await fetchFn(url+'/rest/v1/'+path,{method,headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!r.ok)throw Error('backend_unavailable');return r.json();
 }
 const rpc=(p_action,p_data={})=>db('rpc/nexus_worker_command',{p_action,p_data});
 return async req=>{
  try{
   if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(req.headers.has('origin'))return reply({error:'machine_only'},403);
   if(!url||!serviceKey)return reply({error:'server_not_configured'},503);
   const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
   if(!/^[0-9a-f]{64}$/.test(token))return reply({error:'worker_credential_required'},401);
   if(await rpc('authorize',{token})!==true)return reply({error:'worker_credential_invalid'},401);
   let size=0,body='';if(!req.body)return reply({error:'invalid_body'},400);
   for await(const chunk of req.body){size+=chunk.length;if(size>256)return reply({error:'body_too_large'},413);body+=new TextDecoder().decode(chunk);}
   try{body=JSON.parse(body);}catch{return reply({error:'invalid_json'},400);}
   if(body?.action!=='connection_test'||Object.keys(body).length!==1)return reply({error:'unsupported_action'},400);
   // Verify key access before reserving a single global attempt. It never leaves this worker.
   const apiKey=await db('rpc/nexus_ai_key',{});
   if(typeof apiKey!=='string'||!apiKey.startsWith('sk-ant-'))return reply({error:'vault_key_unavailable'},503);
   if(await rpc('claim_test')!==true)return reply({skipped:true,reason:'not_armed_or_already_attempted',paid_calls:0});
   let audit;
   try{
    const r=await fetchFn('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','anthropic-version':'2023-06-01','x-api-key':apiKey},
     body:JSON.stringify({model:MODEL,max_tokens:8,thinking:{type:'disabled'},messages:[{role:'user',content:'Reply only OK.'}]}),signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!r.ok)throw Error('provider_http_'+r.status);
    const v=await r.json(),input=v.usage?.input_tokens,output=v.usage?.output_tokens;
    const text=(v.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('').trim();
    if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0||text!=='OK'||v.stop_reason!=='end_turn')throw Error('provider_response_unverified');
    audit={status:'succeeded',input_tokens:input,output_tokens:output,estimated_cost_usd:(input*0.10+output*0.50)/1000000};
   }catch(e){audit={status:'failed',error_code:/^provider_http_\d{3}$/.test(e.message)?e.message:'provider_failed_or_unknown_no_retry'};}
   const saved=await db('ai_connection_runs?run_key=eq.claude-connection-v1',{...audit,completed_at:new Date().toISOString()},'PATCH');
   if(saved.length!==1)throw Error('audit_write_failed');
   return reply({...audit,model:MODEL,paid_calls:1,cost_is_estimate:true,no_retry:true});
  }catch{return reply({error:'worker_unavailable_no_retry'},503);}
 };
}
