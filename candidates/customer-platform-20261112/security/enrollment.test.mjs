import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {createEnrollmentLifecycle,createMemoryEnrollmentStore,createServerEnrollmentStore} from './enrollment-lifecycle.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',APP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTH='Bearer SYNTHETIC_AUTH_NOT_REAL_000000000';
const application={customer_name:'SYNTHETIC',contact:'synthetic@example.invalid',service_type:'website',description:'SYNTHETIC page',privacy_consent:true,transfer_consent:true,submission_id:'33333333-3333-4333-8333-333333333333'};
const memory=()=>{let at=1000000,account=A,submissions=0;const store=createMemoryEnrollmentStore({clock:()=>at});const lifecycle=createEnrollmentLifecycle({enabled:true,clock:()=>at,store,authenticate:async()=>({id:account,emailConfirmed:true,expiresAt:at+600000}),submitIntake:async({application:input,authenticatedAccountId})=>{assert.equal(input.customer_name,'SYNTHETIC');assert.equal(authenticatedAccountId,A);submissions++;return {applicationId:APP,receiptNumber:'NX-SYNTHETIC'}}});return {store,lifecycle,advance(ms){at+=ms},account(value){account=value},submissions:()=>submissions};};
test('proof issuer uses only authoritative intake return, creates 256-bit secret and stores hash only',async()=>{
 const m=memory();await assert.rejects(m.lifecycle.submitAndIssue({authorization:AUTH,application:{...application,applicationId:APP}}),{code:'INVALID_INTAKE'});assert.equal(m.submissions(),0);
 const issued=await m.lifecycle.submitAndIssue({authorization:AUTH,application});assert.equal(issued.enrollmentProof.length,43);assert.equal(Buffer.from(issued.enrollmentProof,'base64url').length,32);assert.equal(issued.expiresAt,1300000);assert.equal(m.submissions(),1);
 const state=m.store.snapshotForTest();assert.equal(state.proofs.length,1);assert.match(state.proofs[0].proofHash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(state).includes(issued.enrollmentProof));assert.equal(state.proofs[0].accountId,A);
});
test('proof bound to verified account; B cannot consume A proof, A exchanges once and replay fails',async()=>{
 const m=memory(),issued=await m.lifecycle.submitAndIssue({authorization:AUTH,application});m.account(B);await assert.rejects(m.lifecycle.exchange({authorization:AUTH,...issued}),{code:'PROOF_DENIED'});assert.equal(m.store.snapshotForTest().proofs[0].consumedAt,null);
 m.account(A);const linked=await m.lifecycle.exchange({authorization:AUTH,...issued});assert.equal(linked.linked,true);assert.match(linked.caseId,/^[a-f0-9-]{36}$/);await assert.rejects(m.lifecycle.exchange({authorization:AUTH,...issued}),{code:'PROOF_DENIED'});assert.equal(m.store.snapshotForTest().cases.length,1);
});
test('serialized atomic exchange model accepts exactly one concurrent redemption and expiration rejects',async()=>{
 const m=memory(),issued=await m.lifecycle.submitAndIssue({authorization:AUTH,application});const replies=await Promise.allSettled(Array.from({length:20},()=>m.lifecycle.exchange({authorization:AUTH,...issued})));assert.equal(replies.filter(x=>x.status==='fulfilled').length,1);assert.equal(m.store.snapshotForTest().cases.length,1);
 const expired=memory(),old=await expired.lifecycle.submitAndIssue({authorization:AUTH,application});expired.advance(300001);await assert.rejects(expired.lifecycle.exchange({authorization:AUTH,...old}),{code:'PROOF_DENIED'});assert.equal(expired.store.snapshotForTest().cases.length,0);
});
test('production issuer/store default off and receipt-only legacy intake cannot mint proof',async()=>{
 await assert.rejects(createEnrollmentLifecycle().submitAndIssue({authorization:AUTH,application}),{code:'NOT_DEPLOYED'});await assert.rejects(createServerEnrollmentStore().issue({}),{code:'NOT_DEPLOYED'});
 const lifecycle=createEnrollmentLifecycle({enabled:true,store:createMemoryEnrollmentStore(),authenticate:async()=>({id:A,emailConfirmed:true,expiresAt:Date.now()+600000}),submitIntake:async()=>({receiptNumber:'NX-ONLY'})});await assert.rejects(lifecycle.submitAndIssue({authorization:AUTH,application}),{code:'INTAKE_PROOF_UNAVAILABLE'});
});
test('SQL proof state: restricted server RPC, hash-only state, atomic consume+bind, cross-account, replay and rollback',async t=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO PUBLIC;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${A}'),('${B}');
 CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);GRANT SELECT ON public.admin_users TO authenticated;
 CREATE TABLE public.applications(id uuid PRIMARY KEY,receipt_number text,status text);INSERT INTO public.applications VALUES('${APP}','NX-SYNTHETIC','received');
 GRANT SELECT ON public.applications TO service_role;`);
 const before=(await db.query('SELECT jsonb_agg(a) AS data FROM applications a')).rows;
 const grantsBefore=(await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='applications' ORDER BY grantee,privilege_type")).rows;
 await db.exec(await readFile(new URL('./customer-schema.candidate.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('./enrollment-proof.candidate.sql',import.meta.url),'utf8'));
 const issue=(h,account=A,expiry="clock_timestamp()+interval '5 minutes'",receipt='NX-SYNTHETIC')=>db.query(`SELECT public.solq_issue_customer_enrollment($1,$2,$3,$4,${expiry})`,[h,APP,account,receipt]);
 const exchange=(h,account=A,receipt='NX-SYNTHETIC')=>db.query('SELECT public.solq_exchange_customer_enrollment($1,$2,$3) AS value',[h,account,receipt]);
 const roles=async r=>db.exec('RESET ROLE;SET ROLE '+r);
 await t.test('API customers and anonymous callers cannot mint, read or exchange proof state',async()=>{for(const role of ['anon','authenticated']){await roles(role);await assert.rejects(issue('a'.repeat(64)),/permission denied/);await assert.rejects(exchange('a'.repeat(64)),/permission denied/);await assert.rejects(db.query('SELECT * FROM solq_customer_private.enrollment_proofs'),/permission denied/);}});
 await roles('service_role');
 await t.test('issuer checks stored application receipt and enforces maximum lifetime',async()=>{await assert.rejects(issue('a'.repeat(64),A,undefined,'WRONG'),/trusted intake/);await assert.rejects(issue('a'.repeat(64),A,"clock_timestamp()+interval '1 hour'"),/check constraint/);await issue('a'.repeat(64));});
 await t.test('wrong account/receipt do not consume; valid proof creates one owned case; replay rejected',async()=>{assert.equal((await exchange('a'.repeat(64),B)).rows[0].value,null);assert.equal((await exchange('a'.repeat(64),A,'WRONG')).rows[0].value,null);const yes=(await exchange('a'.repeat(64))).rows[0].value;assert.ok(yes.caseId);assert.equal((await exchange('a'.repeat(64))).rows[0].value,null);assert.equal((await db.query('SELECT count(*)::int n FROM solq_customer_cases')).rows[0].n,1);});
 await t.test('binding conflict rolls back consumption rather than losing proof',async()=>{await issue('b'.repeat(64),B);await assert.rejects(exchange('b'.repeat(64),B),/binding_not_completed/);assert.equal((await db.query("SELECT consumed_at FROM solq_customer_private.enrollment_proofs WHERE proof_hash=$1",['b'.repeat(64)])).rows[0].consumed_at,null);});
 await t.test('expired proof not redeemable; old application rows and grants unchanged',async()=>{await issue('c'.repeat(64));await db.query("UPDATE solq_customer_private.enrollment_proofs SET created_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '5 minutes' WHERE proof_hash=$1",['c'.repeat(64)]);assert.equal((await exchange('c'.repeat(64))).rows[0].value,null);await db.exec('RESET ROLE');assert.deepEqual((await db.query('SELECT jsonb_agg(a) AS data FROM applications a')).rows,before);assert.deepEqual((await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='applications' ORDER BY grantee,privilege_type")).rows,grantsBefore);});
 }finally{await db.close()}
});

test('existing required intake consents remain mandatory before trusted submission',async()=>{const m=memory();for(const field of ['privacy_consent','transfer_consent'])await assert.rejects(m.lifecycle.submitAndIssue({authorization:AUTH,application:{...application,[field]:false}}),{code:'INVALID_INTAKE'});assert.equal(m.submissions(),0);});
