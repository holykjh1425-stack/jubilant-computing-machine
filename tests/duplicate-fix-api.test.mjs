import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/nexus-orchestrator/handler.mjs';
const app='10000000-0000-4000-8000-000000000001',plan='20000000-0000-4000-8000-000000000002',admin='30000000-0000-4000-8000-000000000003';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
function harness({failure=false,nonAdmin=false}={}){
 const rpc=[];
 const handler=createHandler({url:'https://synthetic.invalid',serviceKey:'SYNTHETIC_SERVER_KEY',fetchFn:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return response({id:admin});
  if(url.includes('/admin_users?'))return response(nonAdmin?[]:[{user_id:admin}]);
  if(url.includes('/ai_work_plans?'))return failure?response({},503):response(url.endsWith(plan)?[{id:plan}]:[]);
  if(url.includes('/applications?'))return response(url.endsWith(app)?[{id:app}]:[]);
  if(url.includes('/rpc/')){rpc.push(JSON.parse(options.body));return response({id:'synthetic-job'});}
  throw Error('unexpected endpoint '+url);
 }});
 const submit=key=>handler(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:'Bearer SYNTHETIC_ADMIN',origin:'https://solqtech.com'},body:JSON.stringify({action:'submit',key,agent:'internal',instruction:'SYNTHETIC work planning request'})}));
 return {submit,rpc};
}
test('100 concurrent old-client requests per key type return 409 without registration RPC',async()=>{
 for(const key of [app,plan]){const {submit,rpc}=harness();const results=await Promise.all(Array.from({length:100},()=>submit(key)));assert.ok(results.every(r=>r.status===409));assert.equal(rpc.length,0);}
});
test('lookup failure and non-admin fail closed; explicit non-customer command remains supported',async()=>{
 for(const options of [{failure:true},{nonAdmin:true}]){const {submit,rpc}=harness(options);assert.ok([403,503].includes((await submit(plan)).status));assert.equal(rpc.length,0);}
 const {submit,rpc}=harness();assert.equal((await submit(crypto.randomUUID())).status,200);assert.equal(rpc.length,1);assert.equal(rpc[0].p_action,'submit');
});
