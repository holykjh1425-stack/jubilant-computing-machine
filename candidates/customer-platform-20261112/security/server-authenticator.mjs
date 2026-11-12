// Trusted server only. No live client creation or key loading. Never log bearer/proof values.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny=()=>Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
export const SERVER_SESSION_SQL='SELECT id,user_id,not_after FROM auth.sessions WHERE id=$1::uuid AND user_id=$2::uuid';
export function createServerAuthenticator({enabled=false,auth,readSession,clock=()=>Date.now()}={}){
 return async authorization=>{
  if(!enabled||!auth||!readSession)throw Object.assign(new Error('NOT_DEPLOYED'),{code:'NOT_DEPLOYED'});
  if(typeof authorization!=='string'||!/^Bearer [^\s]{20,8192}$/.test(authorization))throw deny();
  const token=authorization.slice(7);
  // getUser must validate THIS exact token with Supabase Auth, never a cached SDK user.
  const {data,error}=await auth.getUser(token);const user=data?.user;if(error||!UUID.test(user?.id||'')||user.is_anonymous||(user.banned_until&&new Date(user.banned_until).getTime()>clock())||(!user.email_confirmed_at&&!user.phone_confirmed_at))throw deny();
  let claims;try{claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')))}catch{throw deny()}
  // Parsing is not signature verification: it is safe only after the exact-token getUser above.
  if(claims.sub!==user.id||claims.role!=='authenticated'||claims.is_anonymous!==false||!UUID.test(claims.session_id||'')||!Number.isFinite(claims.exp)||claims.exp*1000<=clock())throw deny();
  // readSession is a parameterized server SQL seam to auth.sessions, never browser REST.
  const session=await readSession({accountId:user.id,sessionId:claims.session_id});
  const sessionEnd=session?.not_after?new Date(session.not_after).getTime():Infinity;
  if((session?.not_after&&!Number.isFinite(sessionEnd))||!session||session.id!==claims.session_id||session.user_id!==user.id||sessionEnd<=clock()||claims.exp*1000<=clock())throw deny();
  return {id:user.id,sessionId:session.id,expiresAt:Math.min(claims.exp*1000,sessionEnd),emailConfirmed:!!user.email_confirmed_at,phoneConfirmed:!!user.phone_confirmed_at,email:user.email_confirmed_at?user.email:undefined};
 };
}
