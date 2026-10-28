// LOCAL ONLY: real Supabase Auth/PostgREST; NO Claude transport or secret reader.
const url=Deno.env.get('SUPABASE_URL')??'';
const key=Deno.env.get('SUPABASE_ANON_KEY')??'';
if(!/^http:\/\/(kong|supabase_kong_solq-local-ci):8000$/.test(url)||!key)throw Error('LOCAL_STACK_REQUIRED');
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 const auth=req.headers.get('authorization')??'';
 if(!auth.startsWith('Bearer '))return reply({error:'login_required'},401);
 const headers={apikey:key,authorization:auth,'content-type':'application/json'};
 const call=(path:string,method='GET',body?:unknown)=>fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});
 try{
  const u=await call('/auth/v1/user');if(!u.ok)return reply({error:'invalid_session'},401);
  const user=await u.json();if(!/^[a-f0-9-]{36}$/.test(user.id))return reply({error:'invalid_session'},401);
  const a=await call('/rest/v1/solq_local_admins?select=user_id&user_id=eq.'+user.id);
  if(!a.ok||(await a.json()).length!==1)return reply({error:'admin_required'},403);
  if(req.method!=='POST')return reply({error:'method_denied'},405);
  const text=await req.text();if(text.length>200)return reply({error:'input_limit'},413);
  const body=JSON.parse(text);
  if(!body||Object.keys(body).length!==1||!/^aaaaaaaa-0000-4000-8000-00000000000[12]$/.test(body.applicationId))return reply({error:'synthetic_id_required'},400);
  const stored=await call('/rest/v1/rpc/solq_local_generate','POST',{p_application:body.applicationId});
  if(!stored.ok)return reply({error:'store_rejected_no_retry'},409);
  return reply({...(await stored.json()),simulationOnly:true,claude:'mock',actualProviderCalls:0,productionStarted:false});
 }catch{return reply({error:'local_integration_stopped_no_retry'},503);}
});
