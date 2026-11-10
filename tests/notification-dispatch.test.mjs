import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createDispatchHandler} from '../supabase/functions/solq-notification-dispatch/handler.mjs';
const key='s'.repeat(40),config={liveSend:'approved',approvalId:'SYNTHETIC',sender:'sender@example.invalid',adminEmail:'admin@example.invalid'};
const options={enabled:true,url:'https://project.supabase.co',serviceKey:'synthetic-service',dispatchKey:key,config,oauth:{clientId:'synthetic-client',clientSecret:'synthetic-secret',refreshToken:'synthetic-refresh'}};
const job={id:'11111111-1111-4111-8111-111111111111',lease_token:'synthetic-lease',receipt_number:'NX-20261110-AABBCCDD',audience:'admin',kind:'application_received'};
const req=(body={action:'drain'},auth=key,headers={})=>new Request('https://dispatch.invalid',{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('shared Edge worker is a byte-exact generated mirror of the already verified worker',async()=>{
 assert.equal(await readFile(new URL('../ops/notifications/worker.mjs',import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/_shared/solq-notification-worker.mjs',import.meta.url),'utf8'));
});
test('dispatcher requires independent authentication and explicit approval before any I/O',async()=>{
 let calls=0;const h=createDispatchHandler({...options,enabled:false,fetchFn:async()=>{calls++;throw Error('forbidden');}});
 assert.equal((await h(req({},'wrong'))).status,403);
 assert.equal((await h(req())).status,503);
 assert.equal((await h(req({action:'drain'},key,{Origin:'https://solqtech.com'}))).status,403);assert.equal(calls,0);
});
test('missing OAuth setup and caller-injected recipients are rejected before queue access',async()=>{
 let calls=0;const fetchFn=async()=>{calls++;throw Error('forbidden');};
 assert.equal((await createDispatchHandler({...options,oauth:{},fetchFn})(req())).status,503);
 const h=createDispatchHandler({...options,fetchFn});
 assert.equal((await h(req({action:'drain',to:'attacker@example.invalid'}))).status,400);
 assert.equal((await h(req({action:'drain',padding:'x'.repeat(200)}))).status,413);assert.equal(calls,0);
});
test('empty queue does not obtain OAuth tokens or send email',async()=>{
 const seen=[];const h=createDispatchHandler({...options,fetchFn:async(url,init)=>{seen.push(url);const action=JSON.parse(init.body).p_action;return Response.json(action==='claim'?null:{});}});
 const r=await h(req());assert.equal(r.status,200);assert.equal((await r.json()).idle,true);assert.equal(seen.length,2);assert.ok(seen.every(x=>x.includes('/rest/v1/rpc/')));
});
for(const [status,outcome] of [[200,'accepted'],[429,'retry_wait'],[500,'uncertain']])test(`serverless OAuth refresh and single-item result: ${outcome}`,async()=>{
 const seen=[],rpc=[];let finished;
 const h=createDispatchHandler({...options,fetchFn:async(url,init)=>{
  seen.push(url);
  if(url==='https://oauth2.googleapis.com/token'){assert.equal(init.body.get('grant_type'),'refresh_token');return Response.json({access_token:'synthetic-access'});}
  if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){assert.equal(init.headers.Authorization,'Bearer synthetic-access');return Response.json({id:'synthetic-mail'}, {status});}
  const d=JSON.parse(init.body);rpc.push(d.p_action);if(d.p_action==='finish')finished=d.p_data;return Response.json(d.p_action==='claim'?job:{});
 }});
 const r=await h(req());assert.equal(r.status,200);const result=await r.json();assert.equal(result.outcome,outcome);assert.equal(finished.outcome,outcome);
 assert.deepEqual(rpc,['reconcile','claim','finish']);assert.equal(seen.filter(x=>x.includes('messages/send')).length,1);
 const text=JSON.stringify(result);for(const secret of ['synthetic-access','synthetic-refresh','synthetic-service','admin@example.invalid'])assert.ok(!text.includes(secret));
});
test('refresh token revoked: no Gmail send; queue records authentication failure',async()=>{
 let sends=0,finished;const h=createDispatchHandler({...options,fetchFn:async(url,init)=>{
  if(url.includes('oauth2.googleapis.com'))return Response.json({error:'invalid_grant'},{status:400});
  if(url.includes('gmail.googleapis.com')){sends++;throw Error('forbidden');}
  const d=JSON.parse(init.body);if(d.p_action==='finish')finished=d.p_data;return Response.json(d.p_action==='claim'?job:{});
 }});await h(req());assert.equal(sends,0);assert.equal(finished.outcome,'failed');assert.equal(finished.error_code,'auth_unavailable');
});
test('queue acknowledgement outage stops safely without an automatic second send',async()=>{
 let sends=0;const h=createDispatchHandler({...options,fetchFn:async(url,init)=>{
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic'});
  if(url.includes('gmail.googleapis.com')){sends++;return Response.json({id:'synthetic'});}
  const d=JSON.parse(init.body);if(d.p_action==='finish')throw Error('synthetic transport loss');return Response.json(d.p_action==='claim'?job:{});
 }});assert.equal((await h(req())).status,503);assert.equal(sends,1);
});
