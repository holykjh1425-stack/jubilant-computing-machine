const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createQuoteHandler({url,publishableKey,fetchFn=fetch}) {
 const origins=new Set(['https://solqtech.com','https://holykjh1425-stack.github.io']);
 return async req=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!origins.has(origin))return reply({error:'origin_denied'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return reply({error:'authentication_required'},401);
  const backend=async(path,method='GET',body)=>{
   const r=await fetchFn(url+path,{method,headers:{apikey:publishableKey,Authorization:auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error('backend');return r.json();
  };
  try {
   let length=0;const parts=[];if(!req.body)return reply({error:'invalid_body'},400);
   for await(const part of req.body){length+=part.length;if(length>8192)return reply({error:'body_too_large'},413);parts.push(part);}
   const bytes=new Uint8Array(length);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
   const body=JSON.parse(new TextDecoder().decode(bytes));
   if(!UUID.test(body.application_id||''))return reply({error:'invalid_application'},400);
   const user=await backend('/auth/v1/user');if(!UUID.test(user?.id||''))return reply({error:'invalid_session'},401);
   const admins=await backend('/rest/v1/admin_users?select=user_id&user_id=eq.'+user.id);
   if(admins.length!==1)return reply({error:'admin_required'},403);
   if(body.action==='record'){
    const {action,...input}=body;
    const row=await backend('/rest/v1/rpc/solq_record_quote_evidence','POST',{p_data:input});return reply(row);
   }
   if(body.action!=='list')return reply({error:'unsupported_action'},400);
   const evidence=await backend('/rest/v1/solq_quote_acceptances?application_id=eq.'+body.application_id+'&order=recorded_at.desc');
   return reply({application_id:body.application_id,accepted:evidence.length>0,evidence});
  }catch{return reply({error:'request_rejected'},400);}
 };
}
