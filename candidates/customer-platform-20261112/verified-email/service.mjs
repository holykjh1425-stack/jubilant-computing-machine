// Default-disabled server seams. No SDK client, provider, secret or email transport is created here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fail=code=>Object.assign(new Error(code),{code});
export const normalizeEmail=value=>{if(typeof value!=='string'||value.length>200||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())||/[\r\n]/.test(value))throw fail('INVALID_EMAIL');return value.trim().toLowerCase()};
export function createVerifiedIntake({enabled=false,authenticate,store,clock=()=>Date.now()}={}){
 async function identity(authorization){if(!enabled||!authenticate||!store)throw fail('NOT_DEPLOYED');const u=await authenticate(authorization);if(!UUID.test(u?.id||'')||!UUID.test(u.sessionId||'')||!u.emailConfirmed||!Number.isFinite(u.expiresAt)||u.expiresAt<=clock())throw fail('VERIFIED_EMAIL_REQUIRED');return {...u,email:normalizeEmail(u.email)}}
 return Object.freeze({
  async submit({authorization,requestId,payload}){const u=await identity(authorization);
   if(!UUID.test(requestId||'')||!payload||Array.isArray(payload)||typeof payload!=='object'||Object.keys(payload).sort().join(',')!=='consent_version,customer_name,description,privacy_consent,service_type,transfer_consent'||typeof payload.customer_name!=='string'||!payload.customer_name.trim()||payload.customer_name.length>100||typeof payload.description!=='string'||!payload.description.trim()||payload.description.length>5000||!['website','ai_automation','custom_system','consulting'].includes(payload.service_type)||payload.privacy_consent!==true||payload.transfer_consent!==true||payload.consent_version!=='intake-email-v1')throw fail('INVALID_INTAKE');
   const result=await store.submit({accountId:u.id,sessionId:u.sessionId,email:u.email,expiresAt:u.expiresAt,requestId,payload});
   // A successful response requires an atomic committed application + case + outbox receipt.
   if(result?.applicationSaved!==true||!/^NX-\d{8}-[A-F0-9]{8}$/.test(result.receiptNumber||''))throw fail('SAVE_UNCONFIRMED');
   return result;
  },
  async status({authorization,requestId}){const u=await identity(authorization);if(!UUID.test(requestId||''))throw fail('INVALID_REQUEST');return store.status({accountId:u.id,sessionId:u.sessionId,expiresAt:u.expiresAt,requestId})}
 });
}
export function createIntakeStore({enabled=false,serverDb}={}){
 const rpc=async(name,args)=>{if(!enabled||!serverDb)throw fail('NOT_DEPLOYED');const {data,error}=await serverDb.rpc(name,args);if(error)throw fail(error.code==='22023'?'IDEMPOTENCY_OR_INPUT_CONFLICT':'SAVE_UNCONFIRMED');return data};
 return {submit:r=>rpc('solq_submit_verified_application',{p_account:r.accountId,p_session:r.sessionId,p_email:r.email,p_request:r.requestId,p_payload:r.payload,p_auth_expires:new Date(r.expiresAt).toISOString()}),status:r=>rpc('solq_verified_receipt_status',{p_account:r.accountId,p_session:r.sessionId,p_request:r.requestId,p_auth_expires:new Date(r.expiresAt).toISOString()})};
}
export function createOtpGateway({enabled=false,synthetic=false,sendApproved=false,accountCreationApproved=false,auth,reserve}={}){
 function ready(){if(!enabled||!auth||!reserve||!synthetic&&!sendApproved)throw fail('NOT_DEPLOYED')}
 return {
  async request({email,context}){ready();email=normalizeEmail(email);if(!await reserve({email,operation:'send',context}))throw fail('RATE_LIMITED');
   const {error}=await auth.signInWithOtp({email,options:{shouldCreateUser:accountCreationApproved}});
   // Generic reply avoids exposing whether an email/account exists. No redirect supplied by caller.
   if(error)throw fail('AUTH_REQUEST_UNCONFIRMED');return {requested:true,message:'요청을 확인했습니다. 메일이 도착하면 인증번호를 입력해 주세요.'};
  },
  async verify({email,code,context}){ready();email=normalizeEmail(email);if(typeof code!=='string'||!/^\d{6}$/.test(code))throw fail('INVALID_CODE');if(!await reserve({email,operation:'verify',context}))throw fail('RATE_LIMITED');
   const {data,error}=await auth.verifyOtp({email,token:code,type:'email'});if(error||!data?.session||!data.user?.email_confirmed_at||normalizeEmail(data.user.email)!==email)throw fail('AUTH_FAILED');return data;
  }
 };
}
export function createMemoryOtpLimiter({clock=()=>Date.now()}={}){
 // Synthetic model only. Production must use a persistent shared reservation seam.
 const hits=new Map();return async({email,operation,context})=>{
  if(typeof context?.networkKey!=='string'||!context.networkKey)throw fail('TRUSTED_NETWORK_CONTEXT_REQUIRED');
  const now=clock(),rules=operation==='send'?[[email,60000,1],[email,3600000,3],[context.networkKey,3600000,10]]:[[email,600000,5],[context.networkKey,600000,20]];
  const sets=rules.map(([key,window,max])=>{const id=operation+':'+key+':'+window;return {id,window,max,list:(hits.get(id)||[]).filter(t=>t>now-window)}});
  if(sets.some(x=>x.list.length>=x.max))return false;for(const x of sets)hits.set(x.id,[...x.list,now]);return true;
 };
}
export function createPersistentOtpLimiter({enabled=false,serverDb,keyFor}={}){
 // keyFor must HMAC with existing approved server-only secret; never store plaintext email/IP.
 // networkKey must be derived by trusted server ingress, not request JSON/X-Forwarded-For blindly.
 return async({email,operation,context})=>{if(!enabled||!serverDb||!keyFor)throw fail('NOT_DEPLOYED');const emailKey=await keyFor(normalizeEmail(email));const networkKey=context?.networkKey;if(!/^[a-f0-9]{64}$/.test(emailKey||'')||! /^[a-f0-9]{64}$/.test(networkKey||''))throw fail('TRUSTED_NETWORK_CONTEXT_REQUIRED');const {data,error}=await serverDb.rpc('solq_reserve_email_auth',{p_email_key:emailKey,p_network_key:networkKey,p_operation:operation});if(error)throw fail('RATE_LIMIT_UNCONFIRMED');return data===true};
}
export function createIntakeHandler({enabled=false,origins=[],service}={}){
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers});
  if(!enabled||!service)return reply({error:'not_deployed'},503);
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(!origins.includes(req.headers.get('origin'))||req.headers.get('x-solq-request')!=='v1'||!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'origin_or_csrf_denied'},403);
  try{let total=0,parts=[];if(!req.body)return reply({error:'invalid_request'},400);for await(const chunk of req.body){total+=chunk.length;if(total>24000)return reply({error:'too_large'},413);parts.push(chunk)}const bytes=new Uint8Array(total);let i=0;for(const part of parts){bytes.set(part,i);i+=part.length}const body=JSON.parse(new TextDecoder().decode(bytes));
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','requestId','payload'].includes(k))||!['submit','status'].includes(body.action))return reply({error:'invalid_request'},400);
   const input={authorization:req.headers.get('authorization')||'',requestId:body.requestId,payload:body.payload};return reply(await service[body.action](input),200);
  }catch(e){const known=['NOT_DEPLOYED','VERIFIED_EMAIL_REQUIRED','AUTH_REQUIRED','INVALID_INTAKE','INVALID_REQUEST','IDEMPOTENCY_OR_INPUT_CONFLICT','SAVE_UNCONFIRMED'];return reply({error:known.includes(e?.code)?e.code:'request_unconfirmed'},['AUTH_REQUIRED','VERIFIED_EMAIL_REQUIRED'].includes(e?.code)?401:['INVALID_INTAKE','INVALID_REQUEST'].includes(e?.code)?400:503)}
 };
}
