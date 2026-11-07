import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const BASE='https://elfacqmvygnwjlklqhiz.supabase.co';
export function restrictedFetch(fetchFn){
 const once=new Set();
 return async(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url),method=(options.method||input?.method||'GET').toUpperCase();
  let allow=false,single=false;
  if(u.origin!==BASE)throw Error('HOST_DENIED');
  if(method==='POST'&&u.pathname==='/auth/v1/token'&&u.search==='?grant_type=password'){allow=true;single=true;}
  if(method==='POST'&&u.pathname==='/auth/v1/logout'&&u.search==='?scope=local'){allow=true;single=true;}
  if(method==='GET'&&u.pathname==='/auth/v1/user'&&!u.search)allow=true;
  if(method==='GET'&&u.pathname==='/rest/v1/admin_users'&&u.searchParams.get('select')==='user_id'&&/^eq\.[a-f0-9-]{36}$/i.test(u.searchParams.get('user_id')||'')&&[...u.searchParams.keys()].every(k=>['select','user_id'].includes(k)))allow=true;
  if(method==='HEAD'&&/^\/rest\/v1\/(applications|ai_work_plans|orchestrator_jobs)$/.test(u.pathname)&&u.search==='?select=id')allow=true;
  if(method==='POST'&&u.pathname==='/functions/v1/nexus-orchestrator'&&!u.search&&options.body===JSON.stringify({action:'capabilities'})){allow=true;single=true;}
  if(!allow)throw Error('REQUEST_DENIED');
  const key=method+' '+u.pathname;
  if(single&&once.has(key))throw Error('RETRY_DENIED');
  if(single)once.add(key);
  return fetchFn(input,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
 };
}
export async function checkReads(db){
 const identity=await db.auth.getUser();
 if(identity.error||!identity.data?.user?.id)throw Error('AUTH_REQUIRED');
 const uid=identity.data.user.id;
 const admin=await db.from('admin_users').select('user_id').eq('user_id',uid).maybeSingle();
 if(admin.error||admin.data?.user_id!==uid)throw Error('ADMIN_REQUIRED');
 const counts={};
 for(const table of ['applications','ai_work_plans','orchestrator_jobs']){
  const r=await db.from(table).select('id',{head:true,count:'exact'});
  if(r.error||!Number.isSafeInteger(r.count)||r.count<0)throw Error('COUNT_UNCONFIRMED');
  counts[table]=r.count;
 }
 const edge=await db.functions.invoke('nexus-orchestrator',{body:{action:'capabilities'}});
 if(edge.error||edge.data?.paid_calls!==0||edge.data?.external_execution_enabled!==false)throw Error('EDGE_UNCONFIRMED');
 return {actual_admin_auth:true,admin_membership:true,postgrest_read:true,edge_capabilities:true,counts,business_writes:0,new_quote_api_tested:false};
}
function hidden(prompt){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('INTERACTIVE_TERMINAL_REQUIRED');
 return new Promise((accept,reject)=>{
  let text='';process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
  const finish=()=>{process.stdin.removeListener('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
  const onData=chunk=>{for(const c of chunk){if(c==='\u0003'){finish();reject(Error('CANCELLED'));return;}if(c==='\r'||c==='\n'){finish();accept(text);return;}if(c==='\u007f'||c==='\b'){text=Array.from(text).slice(0,-1).join('');}else if(c>=' ')text+=c;}};
  process.stdin.on('data',onData);
 });
}
async function main(){
 if(process.argv.length!==3)throw Error('PACKAGE_PATH_REQUIRED');
 const root=resolve(process.argv[2]),cfg=readFileSync(resolve(root,'config.js'),'utf8');
 if(!cfg.includes(BASE))throw Error('PROJECT_MISMATCH');
 const key=cfg.match(/SUPABASE_ANON_KEY:\s*"(sb_publishable_[A-Za-z0-9_-]+)"/)?.[1];
 if(!key)throw Error('PUBLIC_CONFIG_REQUIRED');
 const sdkPath=resolve(root,'vendor/supabase-2.118.0.js'),sdkBytes=readFileSync(sdkPath);
 const manifest=JSON.parse(readFileSync(new URL('phase1-files.json',import.meta.url),'utf8'));
 if(createHash('sha256').update(sdkBytes).digest('hex')!==manifest.files['vendor/supabase-2.118.0.js'])throw Error('SDK_INTEGRITY_FAILED');
 const {createClient}=new Function(sdkBytes.toString('utf8')+';return supabase;')();
 const db=createClient(BASE,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:restrictedFetch(fetch)}});
 let email='',password='',result,loggedIn=false,ended=false;
 try{
  email=(await hidden('Existing SOLQ administrator email (hidden): ')).trim();password=await hidden('Password (hidden): ');
  const login=await db.auth.signInWithPassword({email,password});email='';password='';
  if(login.error)throw Error('LOGIN_FAILED_NO_RETRY');loggedIn=true;
  result=await checkReads(db);
 }finally{
  email='';password='';
  if(loggedIn){try{ended=!(await db.auth.signOut({scope:'local'})).error;}catch{ended=false;}}
  if(loggedIn&&!ended)process.stdout.write('SESSION_END_UNCONFIRMED: close this process; do not publish its memory or token.\n');
 }
 process.stdout.write(JSON.stringify({...result,local_session_ended:ended},null,2)+'\n');
 if(!ended)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(()=>{process.stderr.write('STOP: authentication, permission, count or Edge check failed. No retry or business write performed.\n');process.exitCode=1;});
}
