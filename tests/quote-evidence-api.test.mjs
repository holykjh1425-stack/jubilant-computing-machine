import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteHandler} from '../supabase/functions/solq-quote-evidence/handler.mjs';
const id='11111111-1111-4111-8111-111111111111';
const request=(body,auth=true)=>new Request('https://local.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer SYNTHETIC-LOCAL-TOKEN'}:{})},body:JSON.stringify(body)});
test('unauthenticated and nonadmin access is blocked before evidence retrieval',async()=>{
 let paths=[];const h=createQuoteHandler({url:'https://local.invalid',publishableKey:'SYNTHETIC',fetchFn:async(url)=>{paths.push(url);return Response.json(url.includes('/auth/')?{id}:[]);}});
 assert.equal((await h(request({action:'list',application_id:id},false))).status,401);
 assert.equal(paths.length,0);assert.equal((await h(request({action:'list',application_id:id}))).status,403);assert.equal(paths.length,2);
});
test('admin queries are application scoped and use the verified user JWT',async()=>{
 let paths=[];const h=createQuoteHandler({url:'https://local.invalid',publishableKey:'SYNTHETIC',fetchFn:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer SYNTHETIC-LOCAL-TOKEN');paths.push(url);return Response.json(url.includes('/auth/')?{id}:url.includes('/admin_users')?[{user_id:id}]:[]);}});
 const result=await h(request({action:'list',application_id:id}));assert.equal(result.status,200);assert.equal((await result.json()).accepted,false);assert.ok(paths[2].includes('application_id=eq.'+id));
 assert.equal((await h(request({action:'list',application_id:'x&select=*'}))).status,400);
});
test('recording forwards to identity-checking RPC without service role credentials',async()=>{
 let body;const h=createQuoteHandler({url:'https://local.invalid',publishableKey:'SYNTHETIC',fetchFn:async(url,options)=>{if(url.includes('/auth/'))return Response.json({id});if(url.includes('/admin_users'))return Response.json([{user_id:id}]);assert.ok(url.endsWith('/rpc/solq_record_quote_evidence'));body=JSON.parse(options.body);return Response.json({accepted:true});}});
 const response=await h(request({action:'record',application_id:id,verified_by:id}));assert.equal(response.status,200);assert.equal(body.p_data.verified_by,id); // DB rejects client identity, covered by SQL integration test.
});
for(const action of ['issue_quote','record_deposit','confirm_deposit'])test(action+' uses authenticated, application-bound ledger RPC',async()=>{
 let sent;const h=createQuoteHandler({url:'https://local.invalid',publishableKey:'SYNTHETIC',fetchFn:async(url,options)=>{
 assert.equal(options.headers.Authorization,'Bearer SYNTHETIC-LOCAL-TOKEN');if(url.includes('/auth/'))return Response.json({id});if(url.includes('/admin_users'))return Response.json([{user_id:id}]);assert.ok(url.endsWith('/rpc/solq_quote_ledger'));sent=JSON.parse(options.body);return Response.json({id:'SYNTHETIC'});
 }});assert.equal((await h(request({action,application_id:id}))).status,200);assert.equal(sent.p_action,action);assert.equal(sent.p_data.application_id,id);
});
test('list scopes all ledgers and does not treat expired consent as current acceptance',async()=>{
 const paths=[];const h=createQuoteHandler({url:'https://local.invalid',publishableKey:'SYNTHETIC',fetchFn:async url=>{
 paths.push(url);if(url.includes('/auth/'))return Response.json({id});if(url.includes('/admin_users'))return Response.json([{user_id:id}]);
 if(url.includes('/solq_issued_quotes?'))return Response.json([{version:2,quote_reference:'SYNTHETIC',amount_krw:100000,expires_at:'2000-01-01T00:00:00Z'}]);
 if(url.includes('/solq_quote_acceptances?'))return Response.json([{quote_version:'2',quote_reference:'SYNTHETIC',amount_krw:100000}]);return Response.json([]);
 }});const r=await(await h(request({action:'list',application_id:id}))).json();assert.equal(r.accepted,false);
 assert.equal(paths.length,6);for(const path of paths.slice(2))assert.ok(path.includes('application_id=eq.'+id));
});
