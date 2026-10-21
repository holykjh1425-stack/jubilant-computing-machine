import test from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/nexus-agent-worker/handler.mjs';
const token='1'.repeat(64)+'.'+String(Math.floor(Date.now()/1000)+60),key='sk-ant-synthetic-test-placeholder';
function fixture({used=false,status=200,failAudit=false,failNetwork=false}={}){
 let provider=0,claims=0,records=[],reserved=used;
 const handler=createHandler({url:'https://db.invalid',serviceKey:'server-only',fetchFn:async(url,o)=>{
  const b=JSON.parse(o.body);
  if(url==='https://api.anthropic.com/v1/messages'){
   provider++;assert.equal(o.headers['x-api-key'],key);assert.equal(b.messages[0].content,'Reply only OK.');assert.equal(b.max_tokens,8);assert.equal(o.redirect,'error');
   if(failNetwork)throw Error('network');return new Response(JSON.stringify({content:[{type:'text',text:'OK'}],stop_reason:'end_turn',usage:{input_tokens:9,output_tokens:2}}),{status});
  }
  assert.ok(url.startsWith('https://db.invalid/rest/v1/'));
  let data;
  if(url.endsWith('rpc/nexus_worker_command')){
   if(b.p_action==='authorize')data=b.p_data.token===token;
   else if(b.p_action==='claim_test'){claims++;data=!reserved;reserved=true;}
   else throw Error('unexpected action');
  }else if(url.endsWith('rpc/nexus_ai_key'))data=key;
  else if(url.includes('ai_connection_runs')){if(failAudit)throw Error('write');records.push(b);data=[b];}
  else throw Error('unexpected url');return new Response(JSON.stringify(data));
 }});
 return {handler,count:()=>({provider,claims,records})};
}
const request=(body={action:'connection_test'},auth=token,origin)=>new Request('https://worker.invalid',{method:'POST',headers:{Authorization:'Bearer '+auth,...(origin?{origin}:{})},body:JSON.stringify(body)});
test('only machine credential and fixed action accepted; arbitrary prompts and browser calls rejected',async()=>{
 const f=fixture();assert.equal((await f.handler(request({},'bad'))).status,401);
 assert.equal((await f.handler(request({},'2'.repeat(64)))).status,401);
 assert.equal((await f.handler(request({action:'connection_test',prompt:'anything'}))).status,400);
 assert.equal((await f.handler(request(undefined,token,'https://site.invalid'))).status,403);
 assert.equal(f.count().provider,0);
});
test('one global reservation, fixed minimal call, sanitized audit, duplicates skipped',async()=>{
 const f=fixture();const r=await (await f.handler(request())).json();assert.equal(r.status,'succeeded');assert.equal(r.paid_calls,1);
 assert.equal((await (await f.handler(request())).json()).skipped,true);assert.equal(f.count().provider,1);
 assert.ok(!JSON.stringify(r).includes(key));assert.ok(!JSON.stringify(f.count().records).includes(key));
});
test('concurrent duplicate requests cannot produce two provider calls',async()=>{
 const f=fixture();await Promise.all([f.handler(request()),f.handler(request())]);assert.equal(f.count().provider,1);
});
test('provider error or timeout is never retried and consumes the global attempt',async()=>{
 for(const opts of [{status:401},{status:404},{failNetwork:true}]){
  const f=fixture(opts);const r=await (await f.handler(request())).json();assert.equal(r.status,'failed');
  await f.handler(request());assert.equal(f.count().provider,1);assert.equal(f.count().records[0].status,'failed');
 }
});
test('audit write failure cannot replay a potentially billed attempt',async()=>{
 const f=fixture({failAudit:true});assert.equal((await f.handler(request())).status,503);
 await f.handler(request());assert.equal(f.count().provider,1);
});
