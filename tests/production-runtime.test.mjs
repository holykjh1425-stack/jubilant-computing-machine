import test from 'node:test';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {validateArtifact} from '../supabase/functions/nexus-production/artifact.mjs';
import {createHandler} from '../supabase/functions/nexus-production/handler.mjs';
import {runOpenAI,runClaude} from '../core/providers.mjs';
import {execute,safeChildEnv,runCodex,syntaxCheck,runOne} from '../ops/production-runner.mjs';
const artifact={summary:'Reviewable draft',files:[{path:'index.html',content:'<!doctype html><title>Draft</title><p>Draft</p>'}]};
const task={id:'job',lease:'lease',provider:'codex',execution_authorized:true,plan:{requirements:'Synthetic test'}};
const response=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
function req(body,headers={}){return new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
test('artifact traversal, secrets, duplicate paths and invalid JSON cannot pass review',async()=>{
 assert.equal((await validateArtifact(artifact)).passed,true);
 for(const files of [[{path:'../x.js',content:'1'}],[{path:'a.txt',content:'sk-syntheticSecret1234'}],[{path:'a.json',content:'{'}],[artifact.files[0],artifact.files[0]]])await assert.rejects(validateArtifact({...artifact,files}),/invalid_artifact/);
});
test('Claude is held and OpenAI requires explicit authorization before fetch',async()=>{
 let calls=0;assert.throws(runClaude,/claude_on_hold/);
 await assert.rejects(runOpenAI({...task,provider:'openai',execution_authorized:false,model:'mock'},{apiKey:'mock',fetchFn:()=>{calls++;}}),/budget_gate_closed/);assert.equal(calls,0);
});
test('OpenAI adapter makes one bounded structured response request and never retries',async()=>{
 let calls=0;const generated=await runOpenAI({...task,provider:'openai',model:'mock'},{apiKey:'mock',fetchFn:async(url,init)=>{
 calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(init.body);assert.equal(b.store,false);assert.equal(b.max_output_tokens,4096);assert.equal(b.text.format.strict,true);
 return response({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(artifact)}]}],usage:{input_tokens:1,output_tokens:2}});
 }});assert.deepEqual(generated.result,artifact);assert.equal(calls,1);
 let failures=0;await assert.rejects(runOpenAI({...task,provider:'openai',model:'mock'},{apiKey:'mock',fetchFn:async()=>{failures++;return new Response('',{status:429});}}));assert.equal(failures,1);
});
test('Codex runs isolated with subscription auth, no shell tool and no inherited provider/controller secrets',async()=>{
 const env=safeChildEnv({PATH:'/bin',HOME:'/tmp',OPENAI_API_KEY:'secret',SUPABASE_SERVICE_ROLE_KEY:'secret',ANTHROPIC_API_KEY:'secret'});assert.deepEqual(env,{PATH:'/bin',HOME:'/tmp'});
 const generated=await runCodex(task,{auth:()=>({ready:true}),run:async(bin,args,options)=>{
 assert.ok(args.includes('forced_login_method="chatgpt"'));assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('shell_tool'));assert.ok(args.includes('read-only'));assert.ok(args.includes('--ephemeral'));
 assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.env.SUPABASE_SERVICE_ROLE_KEY,undefined);assert.equal(options.env.ANTHROPIC_API_KEY,undefined);
 await writeFile(args[args.indexOf('--output-last-message')+1],JSON.stringify(artifact));return {stdout:'{"type":"turn.completed","usage":{"input_tokens":1}}\n'};
 }});assert.deepEqual(generated.result,artifact);assert.equal(generated.usage.auth_mode,'chatgpt');
});
test('syntax check parses generated JavaScript without running it',async()=>{
 const result=await syntaxCheck({files:[{path:'test.js',content:'throw new Error("must not execute");'}]});assert.equal(result.generated_code_executed,false);
 await assert.rejects(syntaxCheck({files:[{path:'bad.js',content:'const = ;'}]}));
});
test('worker endpoints deny browser and anonymous requests before backend access',async()=>{
 let calls=0;const h=createHandler({url:'https://db.test',serviceKey:'machine',fetchFn:async()=>{calls++;return response({});}});
 assert.equal((await h(req({action:'claim',provider:'codex'}))).status,403);
 assert.equal((await h(req({action:'claim',provider:'codex'},{Authorization:'Bearer machine',Origin:'https://holykjh1425-stack.github.io'}))).status,403);
 assert.equal((await h(req({action:'claude'}))).status,400);assert.equal(calls,0);
});
test('admin actor comes from verified JWT and membership, never client input',async()=>{
 const actor='11111111-1111-4111-8111-111111111111';let actual;
 const h=createHandler({url:'https://db.test',serviceKey:'machine',fetchFn:async(url,init)=>{
 if(url.endsWith('/auth/v1/user'))return response({id:actor});if(url.includes('admin_users'))return response([{user_id:actor}]);actual=JSON.parse(init.body);return response({ok:true});}});
 assert.equal((await h(req({action:'release',actor:'forged'},{Authorization:'Bearer user'}))).status,200);assert.equal(actual.p_data.actor,actor);
 const denied=createHandler({url:'https://db.test',serviceKey:'machine',fetchFn:async url=>response(url.includes('admin_users')?[]:{id:actor})});assert.equal((await denied(req({action:'snapshot'},{Authorization:'Bearer user'}))).status,403);
});
test('finish ignores forged validation and checks actual artifact',async()=>{
 let actual;const h=createHandler({url:'https://db.test',serviceKey:'machine',fetchFn:async(url,init)=>{actual=JSON.parse(init.body);return response({ok:true});}});
 await h(req({action:'finish',success:true,result:{...artifact,files:[{path:'../bad.txt',content:'bad'}]},validation:{passed:true}},{Authorization:'Bearer machine'}));
 assert.equal(actual.p_data.success,false);assert.equal(actual.p_data.error_code,'invalid_artifact');assert.equal(actual.p_data.result,undefined);
});
test('disabled runner and closed budget cannot call a provider',async()=>{
 let calls=0;const fetchFn=async(url,init)=>{calls++;return response(JSON.parse(init.body).action==='claim'?{blocked:'budget_gate_closed'}:{ok:true});};
 assert.equal((await runOne({provider:'openai',fetchFn})).reason,'execution_not_approved');assert.equal(calls,0);
 let generated=0;const result=await runOne({provider:'openai',enabled:true,serviceKey:'mock',apiKey:'mock',fetchFn,openAI:async()=>{generated++;}});assert.equal(result.execution_started,false);assert.equal(generated,0);assert.equal(calls,2);
});
test('uncertain result persistence does not repeat model execution',async()=>{
 let generated=0,finished=0;await assert.rejects(runOne({provider:'openai',enabled:true,serviceKey:'mock',apiKey:'mock',openAI:async()=>{generated++;return {result:artifact,usage:{}};},fetchFn:async(url,init)=>{
 const action=JSON.parse(init.body).action;if(action==='claim')return response({...task,provider:'openai'});if(action==='finish'){finished++;throw Error('network');}return response({ok:true});
 }}));assert.equal(generated,1);assert.equal(finished,1);
});

test('timed-out native child and descendants are terminated without retry',async()=>{
 const start=Date.now();await assert.rejects(execute(process.execPath,['-e',"require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});setInterval(()=>{},1000)"],{env:safeChildEnv(),timeout:100}),/provider_failed_or_unknown/);assert.ok(Date.now()-start<3000);
});
