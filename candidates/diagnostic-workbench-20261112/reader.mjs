// Server-only candidate. No credential loading, database writes, live client or side effects.
import {createServerAuthenticator} from './server-authenticator.mjs';
const fail=code=>Object.assign(new Error(code),{code});
export function createWorkbenchReader({enabled=false,auth,readSession,readAdmin,readSnapshot,clock=()=>Date.now()}={}){
 const authenticate=createServerAuthenticator({enabled,auth,readSession,clock});
 return async ({authorization,method='GET'}={})=>{
  if(method!=='GET')throw fail('READ_ONLY');
  if(!enabled||typeof readAdmin!=='function'||typeof readSnapshot!=='function')throw fail('NOT_DEPLOYED');
  const before=await authenticate(authorization);
  // readAdmin: parameterized SELECT EXISTS FROM existing public.admin_users WHERE user_id=$1.
  if(await readAdmin(before.id)!==true)throw fail('ADMIN_REQUIRED');
  // readSnapshot must use an approved least-privilege SELECT adapter. No write RPCs allowed.
  const data=await readSnapshot({actorId:before.id});
  const after=await authenticate(authorization);
  if(after.id!==before.id||after.sessionId!==before.sessionId||after.expiresAt<=clock()||await readAdmin(after.id)!==true)throw fail('AUTH_CHANGED');
  return {source:'supabase-readonly-adapter',checkedAt:new Date(clock()).toISOString(),success:true,data};
 };
}
