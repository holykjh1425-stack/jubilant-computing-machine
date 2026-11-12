// Candidate seams only. No SDK initialization, key loading, requests or timers on import.
import {fail,normalizeEmail} from '../verified-email/service.mjs';
export const APPLICATION_URL='https://solqtech.com/#apply';
export const CALLBACK_URL='https://solqtech.com/';
export const CLIENT_AUTH_OPTIONS=Object.freeze({flowType:'pkce',detectSessionInUrl:false,persistSession:true});
// SDK storage must preserve the PKCE verifier on the SAME browser/device across reloads.
// No implicit URL tokens, arbitrary redirect destinations or caller-selected account creation.
export function createLinkAuth({enabled=false,synthetic=false,sendApproved=false,accountCreationApproved=false,auth,reserve,clock=()=>Date.now()}={}){
 let busy=false;
 const ready=()=>{if(!enabled||!auth||!reserve)throw fail('NOT_DEPLOYED')};
 async function identity(){
  ready();const {data,error}=await auth.getUser();const u=data?.user;
  if(error||!u?.id||!u.email_confirmed_at||u.is_anonymous)throw fail('VERIFIED_EMAIL_REQUIRED');
  return {id:u.id,email:normalizeEmail(u.email),emailConfirmed:true};
 }
 return Object.freeze({identity,
  async request({email,context}){
   ready();if(!synthetic&&!sendApproved)throw fail('NOT_DEPLOYED');
   if(busy)throw fail('REQUEST_PENDING');busy=true;
   try{email=normalizeEmail(email);if(!await reserve({email,operation:'send',context}))throw fail('RATE_LIMITED');
    try{await auth.signInWithOtp({email,options:{shouldCreateUser:accountCreationApproved,emailRedirectTo:CALLBACK_URL}})}catch{/* Uniform account/provider reply; never expose raw errors. */}
    // Uniform response: account existence and provider errors never escape to the customer.
    return {requested:true,message:'요청을 확인했습니다. 메일이 도착하면 같은 브라우저에서 인증 링크를 열어 주세요.'};
   }finally{busy=false}
  },
  async complete(url,{scrub,goToApplication}={}){
   ready();let u;try{u=new URL(url)}catch{throw fail('INVALID_CALLBACK')}
   if(u.origin!=='https://solqtech.com'||u.pathname!=='/'||u.hash||u.searchParams.getAll('code').length!==1||[...u.searchParams.keys()].some(k=>k!=='code'))throw fail('INVALID_CALLBACK');
   const code=u.searchParams.get('code');if(!code||code.length>2048||!/^[A-Za-z0-9._~-]+$/.test(code))throw fail('INVALID_CALLBACK');
   if(typeof scrub!=='function'||typeof goToApplication!=='function')throw fail('CALLBACK_BOUNDARY_REQUIRED');
   if(busy)throw fail('REQUEST_PENDING');busy=true;
   // Strip code BEFORE any await; no analytics, external resources or referrer on callback.
   try{scrub(CALLBACK_URL);const {data,error}=await auth.exchangeCodeForSession(code);
    if(error||!data?.session||!Number.isFinite(data.session.expires_at)||data.session.expires_at*1000<=clock())throw fail('AUTH_LINK_FAILED');
    const user=await identity();
    if(data.session.user?.id!==user.id)throw fail('AUTH_CHANGED');
    goToApplication(APPLICATION_URL);return user;
   }catch{throw fail('AUTH_LINK_FAILED')}finally{busy=false}
  }
 });
}
