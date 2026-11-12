import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createServerAuthenticator} from './server-authenticator.mjs';
import {createCustomerRepository} from './customer-repository.mjs';
import {createEnrollmentLifecycle,createServerEnrollmentStore} from './enrollment-lifecycle.mjs';
import {createCustomerLinkHandler} from './account-link-handler.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',SID='30000000-0000-4000-8000-000000000001',APP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const claims={sub:A,role:'authenticated',is_anonymous:false,session_id:SID,exp:2000};
const token=c=>'synthetic.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.not-a-real-signature';
const user={id:A,email_confirmed_at:'2026-11-12T00:00:00Z'};
test('server authenticator disabled by default and validates the exact bearer using getUser before claims/session lookup',async()=>{
 await assert.rejects(createServerAuthenticator()('Bearer '+token(claims)),{code:'NOT_DEPLOYED'});
 const sequence=[],authenticate=createServerAuthenticator({enabled:true,clock:()=>1000000,auth:{async getUser(value){sequence.push('verified');assert.equal(value,token(claims));return {data:{user}}}},async readSession(value){sequence.push('session');assert.deepEqual(value,{accountId:A,sessionId:SID});return {id:SID,user_id:A}}});
 assert.equal((await authenticate('Bearer '+token(claims))).sessionId,SID);assert.deepEqual(sequence,['verified','session']);
});
test('server auth rejects revoked/misbound/expired/anonymous/unverified identities and ignores user_metadata privilege spoof',async()=>{
 const run=(c=claims,u=user,session={id:SID,user_id:A},error=null)=>createServerAuthenticator({enabled:true,clock:()=>1000000,auth:{getUser:async()=>({data:{user:u},error})},readSession:async()=>session})('Bearer '+token(c));
 for(const args of [[claims,user,null],[claims,user,{id:SID,user_id:B}],[{...claims,exp:1}],[{...claims,sub:B}],[{...claims,is_anonymous:true}],[claims,{id:A,user_metadata:{admin:true}}],[claims,user,{id:SID,user_id:A,not_after:'1970-01-01T00:00:01Z'}],[claims,user,{id:SID,user_id:A,not_after:'invalid'}],[claims,{...user,banned_until:'2999-01-01T00:00:00Z'}],[claims,user,undefined,{message:'invalid signature'}]])await assert.rejects(run(...args),{code:'AUTH_REQUIRED'});
 assert.equal((await run(claims,{...user,user_metadata:{admin:true,role:'service_role'}})).id,A);
});
test('server auth rechecks deadline after pending session lookup, never issues on expired result',async()=>{
 let now=1000000;const authenticate=createServerAuthenticator({enabled:true,clock:()=>now,auth:{getUser:async()=>({data:{user}})},readSession:async()=>{now=3000000;return {id:SID,user_id:A}}});await assert.rejects(authenticate('Bearer '+token(claims)),{code:'AUTH_REQUIRED'});
});
test('client repository fails closed on false/error session RPC even if getUser succeeds',async()=>{
 for(const reply of [{data:false},{data:true,error:{code:'missing_schema'}},{data:null}]){
  const db={auth:{getSession:async()=>({data:{session:{user,access_token:token(claims),expires_at:9999999999}}}),getUser:async value=>{assert.equal(value,token(claims));return {data:{user}}}},rpc:async name=>{assert.equal(name,'solq_customer_session_active');return reply}};
  await assert.rejects(createCustomerRepository({db,enabled:true}).verify(),{code:'SESSION_REVOKED'});
 }
});
test('Auth events invalidate pending reads and notify UI asynchronously; listener unsubscribes',async()=>{
 let callback,notified=0,unsubscribed=0;
 const db={auth:{onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){unsubscribed++}}}}}}};
 const repo=createCustomerRepository({db,enabled:true});const stop=repo.subscribeInvalidation(()=>notified++);callback('SIGNED_OUT',null);assert.equal(notified,0);await Promise.resolve();assert.equal(notified,1);stop();assert.equal(unsubscribed,1);
 const ui=await readFile(new URL('../ui/consultant-ui.mjs',import.meta.url),'utf8');assert.match(ui,/subscribeInvalidation\?\.\(\(\)=>clearPrivate\(\)\)/);assert.match(ui,/function clearPrivate\(\)\{privateEpoch\+\+;customer\?\.clear/);assert.match(ui,/frame.removeAttribute\('srcdoc'\)/);assert.match(ui,/sq-private-message/);
});
test('intake returning internal ID cannot issue proof if identity/session changes while awaiting intake',async()=>{
 let identity=A,issued=0;const lifecycle=createEnrollmentLifecycle({enabled:true,clock:()=>1000000,authenticate:async()=>({id:identity,sessionId:SID,emailConfirmed:true,expiresAt:2000000}),store:{async issue(){issued++}},submitIntake:async()=>{identity=B;return {applicationId:APP,receiptNumber:'NX-SYNTHETIC'}}});
 await assert.rejects(lifecycle.submitAndIssue({authorization:'Bearer '+token(claims),application:{customer_name:'SYNTHETIC',privacy_consent:true,transfer_consent:true,submission_id:APP}}),{code:'AUTH_CHANGED'});assert.equal(issued,0);
});
test('server store requires session binding and sends only hash/IDs through restricted v2 RPC',async()=>{
 const calls=[],store=createServerEnrollmentStore({enabled:true,serverDb:{async rpc(name,args){calls.push({name,args});return {data:{caseId:APP}}}}});
 const record={proofHash:'a'.repeat(64),applicationId:APP,accountId:A,receiptNumber:'NX-SYNTHETIC',purpose:'solq_customer_enrollment',expiresAt:2000000};
 await assert.rejects(store.issue(record),{code:'INVALID_ISSUE'});await assert.rejects(store.exchange(record),{code:'AUTH_REQUIRED'});
 await store.issue({...record,sessionId:SID});await store.exchange({...record,sessionId:SID});assert.deepEqual(calls.map(c=>c.name),['solq_issue_customer_enrollment_v2','solq_exchange_customer_enrollment_v2']);assert.equal(calls[0].args.p_session_id,SID);assert.ok(!JSON.stringify(calls).includes('enrollmentProof'));
});
test('HTTP errors never echo raw proof, bearer or dependency exception',async()=>{
 const proof='SYNTHETIC_PRIVATE_PROOF_DO_NOT_ECHO',bearer='Bearer '+token(claims);const handler=createCustomerLinkHandler({enabled:true,allowedOrigins:['https://synthetic.invalid'],lifecycle:{async exchange(){throw new Error(proof+' '+bearer)}}});
 const reply=await handler(new Request('https://synthetic.invalid/link',{method:'POST',headers:{Origin:'https://synthetic.invalid',Authorization:bearer},body:JSON.stringify({receiptNumber:'NX-SYNTHETIC',enrollmentProof:proof})}));const body=await reply.text();assert.equal(reply.status,503);assert.equal(reply.headers.get('Cache-Control'),'no-store');assert.equal(body.includes(proof),false);assert.equal(body.includes(bearer),false);
});
test('passive preview boundary still denies same-origin/scripts/network and external URL-bearing attributes',async()=>{
 const source=await readFile(new URL('../worker/preview.mjs',import.meta.url),'utf8');assert.match(source,/frame.setAttribute\('sandbox',''\)/);assert.match(source,/script-src 'none'/);assert.match(source,/connect-src 'none'/);assert.match(source,/form-action 'none'/);assert.match(source,/referrerpolicy','no-referrer/);assert.ok(!source.includes("sandbox','allow-"));
});
