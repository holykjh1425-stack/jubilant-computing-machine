// Serverless wrapper around the already verified worker. No execution on import.
import {createGmailProvider,createOAuthTokenSource,runOnce,isEmail} from '../_shared/solq-notification-worker.mjs';
const equal=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export function createDispatchHandler({enabled=false,url='',serviceKey='',dispatchKey='',config={},oauth={},fetchFn=fetch}){
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 return async req=>{
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  // This endpoint is server-to-server only. It cannot submit/approve customer work.
  if(req.headers.has('origin')||dispatchKey.length<32||!equal(req.headers.get('authorization')||'',`Bearer ${dispatchKey}`))return reply({error:'dispatch_auth_required'},403);
  if(!enabled||config.liveSend!=='approved'||!config.approvalId)return reply({blocked:'not_approved'},503);
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!serviceKey||!isEmail(config.sender)||!isEmail(config.adminEmail)||!oauth.clientId||!oauth.clientSecret||!oauth.refreshToken)return reply({blocked:'not_configured'},503);
  // Bound the body before parsing. No caller-supplied recipient, provider or budget.
  let bytes=0;const chunks=[];if(!req.body)return reply({error:'invalid_body'},400);
  for await(const part of req.body){bytes+=part.length;if(bytes>128)return reply({error:'body_too_large'},413);chunks.push(part);}
  const data=new Uint8Array(bytes);let offset=0;for(const part of chunks){data.set(part,offset);offset+=part.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(data));}catch{return reply({error:'invalid_json'},400);}
  if(!body||Object.keys(body).length!==1||body.action!=='drain')return reply({error:'invalid_command'},400);
  const command=async(action,input)=>{
   const r=await fetchFn(url+'/rest/v1/rpc/solq_notification_command',{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:input}),signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!r.ok)throw Error('queue_unavailable');return r.json();
  };
  const provider=createGmailProvider({getAccessToken:createOAuthTokenSource({...oauth,fetchFn}),fetchFn});
  try{
   // Exactly one claimed item per invocation; no unbounded background loop.
   const result=await runOnce({command,provider,config});
   // Returned ids/codes are operational metadata. Contact/token/message body excluded.
   return reply(result);
  }catch{return reply({error:'dispatch_incomplete'},503);}
 };
}
