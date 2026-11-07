import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteHandler} from '../../supabase/functions/solq-quote-evidence/handler.mjs';
const app='11111111-1111-4111-8111-111111111111';
function req(body,headers={}) {return new Request('https://isolated.invalid',{method:'POST',headers:{authorization:'Bearer SYNTHETIC-INVALID',...headers},body});}
test('untrusted origin and oversized body stop before auth/backend',async()=>{
 let calls=0;const h=createQuoteHandler({url:'https://isolated.invalid',publishableKey:'SYNTHETIC',fetchFn:async()=>{calls++;throw Error();}});
 assert.equal((await h(req(JSON.stringify({application_id:app}),{origin:'https://untrusted.invalid'}))).status,403);
 assert.equal((await h(req('x'.repeat(8193)))).status,413);
 assert.equal(calls,0);
});
test('rejected session cannot reach customer tables or ledger writes',async()=>{
 const paths=[];const h=createQuoteHandler({url:'https://isolated.invalid',publishableKey:'SYNTHETIC',fetchFn:async url=>{paths.push(url);return Response.json({error:'invalid token'},{status:401});}});
 const response=await h(req(JSON.stringify({action:'issue_quote',application_id:app})));
 assert.equal(response.status,400);assert.equal(paths.length,1);assert.ok(paths[0].endsWith('/auth/v1/user'));
});
test('incomplete ledger retrieval fails closed without accepted=true',async()=>{
 const h=createQuoteHandler({url:'https://isolated.invalid',publishableKey:'SYNTHETIC',fetchFn:async url=>{
 if(url.includes('/auth/'))return Response.json({id:app});
 if(url.includes('/admin_users'))return Response.json([{user_id:app}]);
 if(url.includes('/solq_deposit_evidence'))return Response.json({error:'unavailable'},{status:503});
 return Response.json([]);
 }});
 const r=await h(req(JSON.stringify({action:'list',application_id:app})));
 assert.equal(r.status,400);assert.notEqual((await r.json()).accepted,true);
});
