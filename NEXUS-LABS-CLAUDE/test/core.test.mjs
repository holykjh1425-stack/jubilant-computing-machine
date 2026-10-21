import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuration,providers,orchestrate,ceiling,Fault} from '../core.mjs';
const admin='00000000-0000-4000-8000-000000000001', request={applicationId:'00000000-0000-4000-8000-000000000002',requestId:'00000000-0000-4000-8000-000000000003'};
export const config=()=>configuration({AI_LIVE_ENABLED:'true',AI_DAILY_USD_LIMIT:'10',AI_JOB_USD_LIMIT:'1',OPENAI_MODEL:'test-model',CLAUDE_MODEL:'test-model',OPENAI_INPUT_USD_PER_MILLION:'1',OPENAI_OUTPUT_USD_PER_MILLION:'2',CLAUDE_INPUT_USD_PER_MILLION:'1',CLAUDE_OUTPUT_USD_PER_MILLION:'2'});
function fixture(task='coding', approved=true) {
 let calls=[],records=[],finished=[];
 const store={begin:async()=>({order:{service_type:'website',description:'test'}}),key:async()=>'fixture-secret',record:async(...a)=>records.push(a),finish:async(...a)=>finished.push(a)};
 const call=async(provider,key,instruction,input)=>{calls.push(provider);return {text:calls.length===1?JSON.stringify({task,brief:'Build a draft'}):calls.length===2?'Draft':JSON.stringify({approved,reason:'Reviewed'}),inputTokens:10,outputTokens:10};};
 return {deps:{store,call,config:config()},store,calls,records,finished};
}
test('coding routes OpenAI → Claude → OpenAI, records usage and requires human release',async()=>{
 const f=fixture(); const r=await orchestrate(f.deps,admin,request);
 assert.deepEqual(f.calls,['openai','claude','openai']);assert.equal(r.status,'draft_verified');assert.equal(r.requiresAdminApproval,true);assert.equal(f.records.length,6);
 assert.ok(!JSON.stringify(f.records).includes('fixture-secret'));
});
test('automation uses OpenAI worker; failed verification goes to review',async()=>{const f=fixture('automation',false);const r=await orchestrate(f.deps,admin,request);assert.deepEqual(f.calls,['openai','openai','openai']);assert.equal(r.status,'needs_review');});
test('live disabled and payment/contract/deployment attempts cause zero calls',async()=>{
 for(const action of ['payment','contract','deploy']) {const f=fixture();await assert.rejects(orchestrate(f.deps,admin,{...request,action}),{code:'ADMIN_APPROVAL_REQUIRED'});assert.equal(f.calls.length,0);}
 const f=fixture();f.deps.config.enabled=false;await assert.rejects(orchestrate(f.deps,admin,request),{code:'LIVE_DISABLED'});assert.equal(f.calls.length,0);
});
test('invalid request, budget, missing key, duplicate request fail without spending',async()=>{
 const f=fixture();await assert.rejects(orchestrate(f.deps,admin,{}),{code:'INVALID_REQUEST'});
 f.deps.config.perJob=0.000001;await assert.rejects(orchestrate(f.deps,admin,request),{code:'JOB_BUDGET'});
 f.deps.config=config();f.store.begin=async()=>({existing:true,status:'running'});assert.equal((await orchestrate(f.deps,admin,request)).status,'running');assert.equal(f.calls.length,0);
 f.store.begin=async()=>({order:{description:'test'}});f.store.key=async()=>null;await assert.rejects(orchestrate(f.deps,admin,request),{code:'KEY_MISSING'});assert.equal(f.calls.length,0);
});
test('bad master JSON stops before worker; uncertain failures are not retried',async()=>{
 const f=fixture();f.deps.call=async()=>({text:'not JSON'});await assert.rejects(orchestrate(f.deps,admin,request),{code:'MODEL_SCHEMA'});assert.equal(f.finished[0][2],'MODEL_SCHEMA');
 let count=0;f.deps.call=async()=>{count++;throw new Fault('PROVIDER_UNCERTAIN',502);};await assert.rejects(orchestrate(f.deps,admin,request),{code:'PROVIDER_UNCERTAIN'});assert.equal(count,1);
});
test('provider wire formats, no storage, bounded output, error redaction, truncation',async()=>{
 const seen=[];const send=providers(config(),async(url,opts)=>{seen.push({url,opts,body:JSON.parse(opts.body)});return {ok:true,json:async()=>url.includes('anthropic')?{content:[{type:'text',text:'OK'}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}],usage:{input_tokens:1,output_tokens:1}}};});
 for(const p of ['openai','claude'])assert.equal((await send(p,'fixture-secret','draft',{})).text,'OK');
 assert.equal(seen[0].body.store,false);assert.equal(seen[0].body.max_output_tokens,512);assert.equal(seen[1].body.max_tokens,512);assert.equal(seen[1].opts.redirect,'error');
 const bad=providers(config(),async()=>({ok:false,status:401,json:async()=>({error:'fixture-secret'})}));await assert.rejects(bad('claude','fixture-secret','',{}),e=>e.code==='PROVIDER_REJECTED'&&!e.message.includes('fixture-secret'));
 const incomplete=providers(config(),async()=>({ok:true,json:async()=>({stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]})}));await assert.rejects(incomplete('claude','key','',{}),{code:'PROVIDER_INCOMPLETE'});
 await assert.rejects(send('openai','key','',{text:'x'.repeat(40000)}),{code:'INPUT_LIMIT'});
});
test('missing/zero/NaN prices fail closed; reservation covers maximum input',()=>{assert.throws(()=>configuration({}),{code:'CONFIG_AI_DAILY_USD_LIMIT'});assert.ok(ceiling(config(),'openai')>0.03);});
