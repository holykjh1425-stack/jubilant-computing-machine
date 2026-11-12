import test from 'node:test';import assert from 'node:assert/strict';import {createCustomerLinkHandler} from './account-link-handler.mjs';import {createEnrollmentLifecycle,createMemoryEnrollmentStore} from './enrollment-lifecycle.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',APP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const origin='https://example.invalid',token='Bearer SYNTHETIC_AUTH_TOKEN_NOT_REAL_000';
const request=(body,o=origin)=>new Request(origin,{method:'POST',headers:{origin:o,authorization:token,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('HTTP enrollment wrapper rejects receipt/name, other account proof, replay and wrong origin; default off',async()=>{
 assert.equal((await createCustomerLinkHandler()(request({}))).status,503);
 let account=A,verified=true;const store=createMemoryEnrollmentStore();
 const lifecycle=createEnrollmentLifecycle({enabled:true,store,authenticate:async()=>({id:account,expiresAt:Date.now()+600000,emailConfirmed:verified}),submitIntake:async()=>({applicationId:APP,receiptNumber:'NX-SYNTHETIC'})});
 const issued=await lifecycle.submitAndIssue({authorization:token,application:{privacy_consent:true,transfer_consent:true,submission_id:'33333333-3333-4333-8333-333333333333'}});
 const body={receiptNumber:issued.receiptNumber,enrollmentProof:issued.enrollmentProof};const handler=createCustomerLinkHandler({enabled:true,allowedOrigins:[origin],lifecycle});
 assert.equal((await handler(request({receiptNumber:'NX-SYNTHETIC',name:'person'}))).status,400);
 assert.equal((await handler(request(body,'https://evil.invalid'))).status,403);
 account=B;assert.equal((await handler(request(body))).status,403);assert.equal(store.snapshotForTest().cases.length,0);
 account=A;verified=false;assert.equal((await handler(request(body))).status,403);verified=true;
 const response=await handler(request(body));assert.equal(response.status,200);assert.equal((await response.json()).linked,true);assert.equal(store.snapshotForTest().cases.length,1);assert.equal((await handler(request(body))).status,403);
});
