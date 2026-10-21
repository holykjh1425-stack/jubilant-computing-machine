import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {artifactSchema,validateArtifact} from '../supabase/functions/nexus-production/artifact.mjs';
import {runOpenAI,buildPrompt} from '../core/providers.mjs';
const endpoint='https://elfacqmvygnwjlklqhiz.supabase.co/functions/v1/nexus-production';
export function safeChildEnv(env=process.env){return Object.fromEntries(['PATH','HOME','USER','LANG','TMPDIR','CODEX_HOME'].filter(k=>env[k]).map(k=>[k,env[k]]));}
export function codexStatus(binary='codex',run=spawnSync){
 const env=safeChildEnv();const v=run(binary,['--version'],{env,encoding:'utf8',timeout:5000});
 if(v.error||v.status!==0)return {ready:false,reason:'codex_cli_unavailable'};
 const a=run(binary,['login','status'],{env,encoding:'utf8',timeout:5000});const text=(a.stdout||'')+(a.stderr||'');
 return {ready:a.status===0&&/chatgpt/i.test(text)&&!/api key/i.test(text),reason:a.status===0&&/chatgpt/i.test(text)?'chatgpt_session':'chatgpt_auth_required_no_api_fallback'};
}
export function execute(binary,args,{cwd,env,input,timeout=120000}){
 return new Promise((resolve,reject)=>{
  const p=spawn(binary,args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:false,detached:process.platform!=='win32'});let stdout='',stderr='',bytes=0,settled=false;
  const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(result);};
  const stop=()=>{try{if(process.platform!=='win32')process.kill(-p.pid,'SIGKILL');else p.kill('SIGKILL');}catch{}p.stdout.destroy();p.stderr.destroy();p.stdin.destroy();};
  const timer=setTimeout(()=>{stop();finish(Error('provider_failed_or_unknown'));},timeout);
  const collect=(which,chunk)=>{bytes+=chunk.length;if(bytes>2000000){stop();finish(Error('runtime_failed'));return;}if(which==='stdout')stdout+=chunk;else stderr+=chunk;};
  p.stdout.on('data',x=>collect('stdout',x));p.stderr.on('data',x=>collect('stderr',x));p.on('error',()=>finish(Error('runtime_failed')));
  p.on('close',code=>finish(code===0?null:Error('runtime_failed'),{stdout,stderr}));p.stdin.on('error',()=>{});p.stdin.end(input||'');
 });
}
export async function runCodex(task,{binary='codex',run=execute,auth=codexStatus}={}){
 if(task.provider!=='codex'||task.execution_authorized!==true||!auth(binary).ready)throw Error('budget_gate_closed');
 const dir=await mkdtemp(join(tmpdir(),'nexus-codex-'));
 try{
  const schema=join(dir,'artifact-schema.json'),output=join(dir,'artifact.json');await writeFile(schema,JSON.stringify(artifactSchema),{mode:0o600});
  const args=['-c','forced_login_method="chatgpt"','exec','--ignore-user-config','--disable','shell_tool','--sandbox','read-only','--skip-git-repo-check','--ephemeral','--json','--output-schema',schema,'--output-last-message',output];
  if(task.model)args.push('--model',task.model);args.push('-');
  const eventStream=await run(binary,args,{cwd:dir,env:safeChildEnv(),input:buildPrompt(task),timeout:120000});
  let complete=false,usage=null,thread=null;
  for(const line of eventStream.stdout.split('\n')){if(!line.trim())continue;let e;try{e=JSON.parse(line);}catch{throw Error('runtime_failed');}
   if(e.type==='thread.started')thread=e.thread_id;if(e.type==='turn.completed'){complete=true;usage=e.usage||null;}if(['turn.failed','error'].includes(e.type))throw Error('provider_failed_or_unknown');}
  if(!complete)throw Error('provider_failed_or_unknown');
  let result;try{result=JSON.parse(await readFile(output,'utf8'));}catch{throw Error('invalid_artifact');}
  return {result,usage:{...usage,thread_id:thread,auth_mode:'chatgpt'}};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function syntaxCheck(result,run=execute){
 const files=[];
 for(const file of result.files)if(/\.m?js$/.test(file.path)){
  await run(process.execPath,['--check','--input-type=module'],{env:safeChildEnv(),input:file.content,timeout:5000});files.push(file.path);
 }
 return {javascript_syntax_checked:files,generated_code_executed:false};
}
export async function runOne({provider,apiKey,serviceKey,enabled=false,binary='codex',fetchFn=fetch,openAI=runOpenAI,codex=runCodex}={}){
 if(!['openai','codex'].includes(provider))throw Error('unsupported_provider');
 if(!enabled)return {execution_started:false,reason:'execution_not_approved'};
 if(!serviceKey)return {execution_started:false,reason:'controller_credential_missing'};
 const ready=provider==='openai'?!!apiKey:codexStatus(binary).ready;
 async function rpc(action,data={}){
  const r=await fetchFn(endpoint,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!r.ok)throw Error('controller_unavailable');return r.json();
 }
 await rpc('heartbeat',{provider,ready});if(!ready)return {execution_started:false,reason:'provider_authentication_missing'};
 const task=await rpc('claim',{provider});if(!task||task.blocked)return {execution_started:false,reason:task?.blocked||'no_eligible_work'};
 let outcome;
 try{
  const generated=provider==='openai'?await openAI(task,{apiKey}):await codex(task,{binary});
  const validation=await validateArtifact(generated.result);Object.assign(validation,await syntaxCheck(generated.result));
  outcome={success:true,result:generated.result,validation,usage:generated.usage};
 }catch(e){outcome={success:false,error_code:['budget_gate_closed','invalid_artifact','provider_failed_or_unknown'].includes(e.message)?e.message:'runtime_failed'};}
 // An uncertain completion write never restarts inference. The reserved attempt remains consumed.
 await rpc('finish',{job_id:task.id,lease:task.lease,...outcome});return {execution_started:true,status:outcome.success?'awaiting_review':'failed',no_retry:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const provider=process.argv[2];
 if(process.argv.includes('--preflight'))console.log(JSON.stringify({codex:codexStatus(process.env.NEXUS_CODEX_BIN||'codex'),openai_key_present:!!process.env.OPENAI_API_KEY,model_call_started:false}));
 else runOne({provider,apiKey:process.env.OPENAI_API_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,enabled:process.env.NEXUS_EXECUTION_APPROVED==='true',binary:process.env.NEXUS_CODEX_BIN||'codex'})
 .then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('production_runner_failed_check_audit');process.exitCode=1;});
}
