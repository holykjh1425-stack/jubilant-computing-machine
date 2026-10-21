import {CAPABILITIES,validateInstruction,tick} from './engine.mjs';
const ORIGIN='https://holykjh1425-stack.github.io';
const uuid=s=>typeof s==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s);
export function createHandler({url,serviceKey,fetchFn=fetch}) {
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,
  'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 async function request(path,method='GET',body,authorization=`Bearer ${serviceKey}`) {
  const r=await fetchFn(url+path,{method,headers:{apikey:serviceKey,Authorization:authorization,'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!r.ok)throw Error('backend_unavailable');return r.json();
 }
 const rpc=(p_action,p_data)=>request('/rest/v1/rpc/nexus_orchestrator_command','POST',{p_action,p_data});
 return async req=>{
  try {
   if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'origin_denied'},403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(!url||!serviceKey)return reply({error:'server_not_configured'},503);
   const auth=req.headers.get('authorization')||'';
   const isWorker=auth===`Bearer ${serviceKey}`;
   let user;
   if(!isWorker){
    if(!auth.startsWith('Bearer '))return reply({error:'login_required'},401);
    try {user=await request('/auth/v1/user','GET',undefined,auth);}catch{return reply({error:'invalid_session'},401);}
    if(!uuid(user?.id))return reply({error:'invalid_session'},401);
    const admins=await request(`/rest/v1/admin_users?select=user_id&user_id=eq.${user.id}`,'GET',undefined,auth);
    if(admins.length!==1)return reply({error:'admin_required'},403);
   }
   // Bounded streaming parser, independent of Content-Length.
   let size=0,parts=[];
   if(!req.body)return reply({error:'invalid_body'},400);
   const reader=req.body.getReader();
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>10000){await reader.cancel();return reply({error:'body_too_large'},413);}parts.push(value);}
   const bytes=new Uint8Array(size);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'invalid_json'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'invalid_body'},400);
   if(isWorker&&body.action!=='tick')return reply({error:'worker_scope_denied'},403);
   if(body.action==='capabilities')return reply({agents:CAPABILITIES,paid_calls:0,external_execution_enabled:false});
   if(body.action==='submit'){
    if(!uuid(body.key)||!Object.hasOwn(CAPABILITIES,body.agent))return reply({error:'invalid_submission'},400);
    let instruction;try{instruction=validateInstruction(body.instruction);}catch{return reply({error:'invalid_instruction_or_credentials'},400);}
    return reply({job:await rpc('submit',{actor:user.id,key:body.key,instruction,agent:body.agent}),paid_calls:0});
   }
   if(body.action==='tick')return reply(await tick(rpc));
   if(body.action==='snapshot'){
    const jobs=await request('/rest/v1/orchestrator_jobs?select=*&order=created_at.desc&limit=50');
    const ids=jobs.map(x=>x.id);if(!ids.every(uuid))throw Error('invalid_backend');
    if(!ids.length)return reply({jobs,tasks:[],events:[],agents:CAPABILITIES});
    const filter=`job_id=in.(${ids.join(',')})`;
    const [tasks,events]=await Promise.all([
     request(`/rest/v1/orchestrator_tasks?select=*&${filter}&order=ordinal.asc&limit=200`),
     request(`/rest/v1/orchestrator_events?select=*&${filter}&order=id.desc&limit=200`)]);
    return reply({jobs,tasks,events,agents:CAPABILITIES,paid_calls:0});
   }
   return reply({error:'unsupported_action'},400);
  } catch {return reply({error:'orchestrator_unavailable_no_paid_retry'},503);}
 };
}
