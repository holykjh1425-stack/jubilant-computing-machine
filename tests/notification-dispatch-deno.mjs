import assert from 'node:assert/strict';
import {createDispatchHandler} from '../supabase/functions/solq-notification-dispatch/handler.mjs';
const key='synthetic-'.repeat(5);
const setup={enabled:true,url:'https://project.supabase.co',serviceKey:'synthetic-service',dispatchKey:key,
 config:{liveSend:'approved',approvalId:'SYNTHETIC-ONLY',sender:'sender@example.invalid',adminEmail:'admin@example.invalid'},
 oauth:{clientId:'synthetic',clientSecret:'synthetic',refreshToken:'synthetic'}};
const request=()=>new Request('https://dispatch.invalid',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:'{"action":"drain"}'});
Deno.test('Deno disabled dispatcher performs zero I/O',async()=>{
 let calls=0;const h=createDispatchHandler({...setup,enabled:false,fetchFn:()=>{calls++;throw Error('forbidden');}});
 assert.equal((await h(request())).status,503);assert.equal(calls,0);
});
for(const ambiguous of [false,true])Deno.test(`Deno Web APIs and Node Buffer: ${ambiguous?'ambiguous response held':'one email accepted'}`,async()=>{
 const actions=[];let outcome;
 const h=createDispatchHandler({...setup,fetchFn:async(url,init)=>{
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic'});
  if(url.includes('gmail.googleapis.com')){assert.equal(typeof JSON.parse(init.body).raw,'string');if(ambiguous)throw Error('synthetic timeout');return Response.json({id:'synthetic-provider-id'});}
  const {p_action,p_data}=JSON.parse(init.body);actions.push(p_action);
  if(p_action==='finish')outcome=p_data.outcome;
  return Response.json(p_action==='claim'?{id:'11111111-1111-4111-8111-111111111111',lease_token:'synthetic',receipt_number:'NX-20261110-AABBCCDD',audience:'admin',kind:'application_received'}:{});
 }});
 const r=await h(request());assert.equal(r.status,200);assert.equal(outcome,ambiguous?'uncertain':'accepted');assert.deepEqual(actions,['reconcile','claim','finish']);
});
