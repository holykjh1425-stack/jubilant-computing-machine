import {validateArtifact} from './artifact.mjs';
const ORIGIN='https://holykjh1425-stack.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createHandler({url,serviceKey,fetchFn=fetch}){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,Vary:'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 async function backend(path,method='GET',body,authorization=`Bearer ${serviceKey}`){
  const r=await fetchFn(url+path,{method,headers:{apikey:serviceKey,Authorization:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!r.ok)throw Error('backend');return r.json();
 }
 return async req=>{
  try{
   const origin=req.headers.get('origin');if(origin&&origin!==ORIGIN)return reply({error:'origin_denied'},403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(!url||!serviceKey)return reply({error:'server_not_configured'},503);
   let size=0,chunks=[];if(!req.body)return reply({error:'invalid_body'},400);
   for await(const chunk of req.body){size+=chunk.length;if(size>120000)return reply({error:'body_too_large'},413);chunks.push(chunk);}
   const bytes=new Uint8Array(size);let p=0;for(const chunk of chunks){bytes.set(chunk,p);p+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'invalid_json'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'invalid_body'},400);
   const {action,...input}=body,auth=req.headers.get('authorization')||'';
   if(['heartbeat','claim','finish'].includes(action)){
    if(auth!==`Bearer ${serviceKey}`||origin)return reply({error:'worker_required'},403);
    if(!['openai','codex'].includes(input.provider)&&action!=='finish')return reply({error:'unsupported_provider'},400);
    if(action==='finish'&&input.success===true){try{input.validation=await validateArtifact(input.result);}catch{input.success=false;input.error_code='invalid_artifact';delete input.result;}}
   }else if(['snapshot','issue_link','release'].includes(action)){
    let user;try{user=await backend('/auth/v1/user','GET',undefined,auth);}catch{return reply({error:'invalid_session'},401);}
    if(!UUID.test(user?.id||''))return reply({error:'invalid_session'},401);
    const admins=await backend(`/rest/v1/admin_users?select=user_id&user_id=eq.${user.id}`,'GET',undefined,auth);
    if(admins.length!==1)return reply({error:'admin_required'},403);input.actor=user.id;
   }else if(!['submit','portal'].includes(action))return reply({error:'unsupported_action'},400);
   const result=await backend('/rest/v1/rpc/nexus_production_command','POST',{p_action:action,p_data:input});
   if(result===null)return reply({error:'not_found'},404);return reply(result);
  }catch{return reply({error:'request_not_completed'},503);}
 };
}
