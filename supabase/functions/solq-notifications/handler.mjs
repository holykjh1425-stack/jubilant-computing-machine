const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKER=new Set(['reconcile','claim','finish']);
const same=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export function createHandler({url,serviceKey,workerKey='',enabled=false,origins=[],fetchFn=fetch}){
 const allowed=new Set(origins);
 async function backend(path,body,authorization=`Bearer ${serviceKey}`){
  const r=await fetchFn(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:serviceKey,Authorization:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!r.ok)throw Error('backend');return r.json();
 }
 return async req=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',Vary:'Origin',
   'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  try{
   if(origin&&!allowed.has(origin))return reply({error:'origin_denied'},403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(!enabled||!url||!serviceKey)return reply({error:'notifications_disabled'},503);
   const chunks=[];let size=0;if(!req.body)return reply({error:'invalid_body'},400);
   for await(const chunk of req.body){size+=chunk.length;if(size>16000)return reply({error:'body_too_large'},413);chunks.push(chunk);}
   const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'invalid_json'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'invalid_body'},400);
   const {action,...input}=body;
   if(WORKER.has(action)){
    if(origin||workerKey.length<32||!same(req.headers.get('authorization')||'',`Bearer ${workerKey}`))return reply({error:'worker_required'},403);
   }else if(action==='snapshot'){
    const auth=req.headers.get('authorization')||'';let user;
    try{user=await backend('/auth/v1/user',undefined,auth);}catch{return reply({error:'invalid_session'},401);}
    if(!UUID.test(user?.id||''))return reply({error:'invalid_session'},401);
    const admins=await backend(`/rest/v1/admin_users?select=user_id&user_id=eq.${user.id}`,undefined,auth);
    if(!Array.isArray(admins)||admins.length!==1)return reply({error:'admin_required'},403);
    // Query using the user's JWT too: no service-role snapshot authorization shortcut.
    const outbox=await backend('/rest/v1/solq_notification_outbox?select=id,event_id,audience,channel,status,attempts,error_code,created_at,updated_at&order=created_at.desc&limit=100',undefined,auth);
    const events=await backend('/rest/v1/solq_customer_events?select=id,application_id,kind,created_at&order=created_at.desc&limit=100',undefined,auth);
    const attempts=await backend('/rest/v1/solq_notification_attempts?select=notification_id,attempt,outcome,error_code,created_at&order=created_at.desc&limit=100',undefined,auth);
    const applications=await backend('/rest/v1/applications?select=id,receipt_number&order=created_at.desc&limit=200',undefined,auth);
    const receipts=new Map(applications.map(x=>[x.id,x.receipt_number]));
    return reply({outbox,events:events.map(e=>({...e,receipt_number:receipts.get(e.application_id)||null})),attempts});
   }else if(!['submit','account_event'].includes(action))return reply({error:'unsupported_action'},400);
   const result=await backend('/rest/v1/rpc/solq_notification_command',{p_action:action,p_data:input});
   return reply(result);
  }catch{return reply({error:'request_not_completed'},503);}
 };
}
