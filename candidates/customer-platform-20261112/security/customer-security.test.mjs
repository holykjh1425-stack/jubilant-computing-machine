import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {createCustomerRepository} from './customer-repository.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',ADMIN='99999999-9999-4999-8999-999999999999';
const APP_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',APP_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CASE_A='10000000-0000-4000-8000-000000000001',CASE_B='10000000-0000-4000-8000-000000000002';
const tables=['solq_customer_cases','solq_customer_consent_events','solq_customer_messages','solq_customer_requests','solq_customer_previews','solq_customer_artifacts'];
test('isolated SQL: verified account mapping, A/B RLS, consent, immutable customer records, previews and preservation',async t=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO PUBLIC;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${A}'),('${B}'),('${ADMIN}');
 CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);INSERT INTO public.admin_users VALUES('${ADMIN}');
 ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;GRANT SELECT ON public.admin_users TO authenticated;
 CREATE POLICY existing_admin_own ON public.admin_users FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
 CREATE TABLE public.applications(id uuid PRIMARY KEY,receipt_number text,status text,description text);
 INSERT INTO public.applications VALUES('${APP_A}','NX-SYNTHETIC-A','received','preserve A'),('${APP_B}','NX-SYNTHETIC-B','received','preserve B');
 ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;GRANT SELECT ON public.applications TO authenticated;
 CREATE POLICY existing_admin_read ON public.applications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid())));`);
 const baseline=(await db.query('SELECT jsonb_agg(a ORDER BY id) AS rows FROM public.applications a')).rows;
 const grantsBefore=(await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('applications','admin_users') ORDER BY table_name,grantee,privilege_type")).rows;
 await db.exec(await readFile(new URL('./customer-schema.candidate.sql',import.meta.url),'utf8'));
 const identity=async(uid,role='authenticated',expired=false)=>{await db.exec(`RESET ROLE;SET ROLE ${role}`);await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,exp:expired?1:9999999999,role})])};
 const provision=(id,app,owner)=>db.query('INSERT INTO public.solq_customer_cases(id,application_id,account_id,verification_reference) VALUES($1,$2,$3,$4)',[id,app,owner,'SYNTHETIC_VERIFIED_LINK']);
 await t.test('customers cannot claim case using receipt/name, self-bind or spoof admin actor',async()=>{
 await identity(A);await assert.rejects(provision(CASE_A,APP_A,A),/row-level security/);assert.equal((await db.query('SELECT * FROM public.applications')).rows.length,0);
 await identity(ADMIN);await provision(CASE_A,APP_A,A);await provision(CASE_B,APP_B,B);
 await assert.rejects(db.query('INSERT INTO solq_customer_cases(application_id,account_id,verification_reference,created_by) VALUES($1,$2,$3,$4)',[APP_A,B,'x',A]));
 });
 const consent=(caseId,accepted=true,actor=A)=>db.query("INSERT INTO public.solq_customer_consent_events(case_id,actor_id,accepted,policy_version) VALUES($1,$2,$3,'chat-v1')",[caseId,actor,accepted]);
 const message=(caseId,actor=A,role='customer',clientId='20000000-0000-4000-8000-000000000001')=>db.query('INSERT INTO public.solq_customer_messages(case_id,actor_id,role,content,client_message_id) VALUES($1,$2,$3,$4,$5)',[caseId,actor,role,'SYNTHETIC private message',clientId]);
 const request=(caseId,actor=A)=>db.query("INSERT INTO public.solq_customer_requests(case_id,actor_id,kind,message,expected_version,client_request_id) VALUES($1,$2,'revision','SYNTHETIC revise heading',1,gen_random_uuid())",[caseId,actor]);
 await t.test('no record linkage before explicit consent; only owned consent and customer messages',async()=>{
 await identity(A);assert.equal((await db.query('SELECT * FROM public.solq_customer_cases')).rows.length,1);
 await assert.rejects(message(CASE_A),/row-level security/);await assert.rejects(request(CASE_A),/row-level security/);
 await assert.rejects(consent(CASE_B),/row-level security/);await assert.rejects(consent(CASE_A,true,B),/row-level security/);
 await consent(CASE_A);await message(CASE_A);await request(CASE_A);await assert.rejects(message(CASE_A),/duplicate key/);
 await assert.rejects(message(CASE_A,A,'worker',crypto.randomUUID()),/row-level security/);
 await assert.rejects(message(CASE_A,B,'customer',crypto.randomUUID()),/row-level security/);
 await assert.rejects(message(CASE_B),/row-level security/);
 });
 await t.test('customer B cannot read A chats, requests or consent; admin can inspect both',async()=>{
 await identity(B);assert.equal((await db.query('SELECT * FROM solq_customer_messages')).rows.length,0);assert.equal((await db.query('SELECT * FROM solq_customer_requests')).rows.length,0);assert.equal((await db.query('SELECT * FROM solq_customer_consent_events')).rows.length,0);
 await consent(CASE_B,true,B);await message(CASE_B,B,'customer');await identity(ADMIN);assert.equal((await db.query('SELECT * FROM solq_customer_messages')).rows.length,2);
 });
 await t.test('consent withdrawal blocks future chat and revision; no permission to overwrite history',async()=>{
 await identity(A);await consent(CASE_A,false);await assert.rejects(message(CASE_A,A,'customer',crypto.randomUUID()),/row-level security/);await assert.rejects(request(CASE_A),/row-level security/);
 for(const q of ["UPDATE solq_customer_messages SET content='changed'",'DELETE FROM solq_customer_messages','TRUNCATE solq_customer_messages',"UPDATE solq_customer_consent_events SET accepted=true",'DELETE FROM solq_customer_requests','DELETE FROM solq_customer_cases'])await assert.rejects(db.query(q),/permission denied/);
 await consent(CASE_A,true);await request(CASE_A);
 });
 await db.exec('RESET ROLE');
 for(const [caseId,version,state] of [[CASE_A,1,'validated'],[CASE_A,2,'draft'],[CASE_B,1,'validated']]){
 await db.query('INSERT INTO solq_customer_previews(case_id,version,state,validation_summary) VALUES($1,$2,$3,$4)',[caseId,version,state,'SYNTHETIC validation']);
 await db.query('INSERT INTO solq_customer_artifacts(case_id,version,path,content,sha256) VALUES($1,$2,$3,$4,$5)',[caseId,version,'index.html','<!doctype html><h1>SYNTHETIC</h1>','a'.repeat(64)]);
 }
 await t.test('preview versions/files isolated and unpublished draft inaccessible to customer',async()=>{
 await identity(A);const previews=(await db.query('SELECT * FROM solq_customer_previews')).rows;assert.equal(previews.length,1);assert.equal(previews[0].case_id,CASE_A);
 assert.equal((await db.query('SELECT * FROM solq_customer_artifacts')).rows.length,1);assert.equal((await db.query('SELECT * FROM solq_customer_artifacts WHERE case_id=$1',[CASE_B])).rows.length,0);
 await assert.rejects(db.query("INSERT INTO solq_customer_previews(case_id,version,state,validation_summary) VALUES($1,3,'validated','client forge')",[CASE_A]),/permission denied/);
 await assert.rejects(db.query("UPDATE solq_customer_previews SET state='validated'"),/permission denied/);
 await identity(B);assert.equal((await db.query('SELECT * FROM solq_customer_artifacts WHERE case_id=$1',[CASE_A])).rows.length,0);
 await identity(ADMIN);assert.equal((await db.query('SELECT * FROM solq_customer_artifacts')).rows.length,3);
 });
 await t.test('server timestamps and bounded append rate prevent backdated flood',async()=>{
 await identity(A);await db.query("INSERT INTO solq_customer_messages(case_id,actor_id,role,content,created_at) VALUES($1,$2,'customer','backdate attempt','2000-01-01')",[CASE_A,A]);
 const stamped=(await db.query("SELECT created_at FROM solq_customer_messages WHERE content='backdate attempt'")).rows[0].created_at;assert.ok(new Date(stamped).getFullYear()>=2026);
 for(let i=0;i<10;i++)await message(CASE_A,A,'customer',crypto.randomUUID());
 await assert.rejects(message(CASE_A,A,'customer',crypto.randomUUID()),/rate_limited/);
 await request(CASE_A);await assert.rejects(request(CASE_A),/rate_limited/);
 });
 await t.test('expired identities and anonymous users cannot access customer data or write',async()=>{
 await identity(A,'authenticated',true);for(const table of tables)assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0);await assert.rejects(consent(CASE_A),/row-level security/);
 await identity(A,'anon');for(const table of tables)await assert.rejects(db.query('SELECT * FROM '+table),/permission denied/);await assert.rejects(message(CASE_A),/permission denied/);
 });
 await t.test('original customer rows, existing grants and approval boundaries remain unchanged',async()=>{
 await db.exec('RESET ROLE');assert.deepEqual((await db.query('SELECT jsonb_agg(a ORDER BY id) AS rows FROM public.applications a')).rows,baseline);
 const grantsAfter=(await db.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('applications','admin_users') ORDER BY table_name,grantee,privilege_type")).rows;assert.deepEqual(grantsAfter,grantsBefore);
 for(const table of tables)assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,'TRUNCATE') AS allowed",['public.'+table])).rows[0].allowed,false);
 });
 }finally{await db.close()}
});
test('repository default refuses production connection; verified Auth identity required',async()=>{
 await assert.rejects(createCustomerRepository({}).verify(),{code:'NOT_DEPLOYED'});
 const user={id:A};const db={rpc:async()=>({data:true}),auth:{getSession:async()=>({data:{session:{user,access_token:'SYNTHETIC_NOT_REAL_ACCESS_TOKEN',expires_at:9999999999}}}),getUser:async()=>({data:{user}})}};
 await assert.rejects(createCustomerRepository({db,enabled:true}).verify(),{code:'VERIFIED_IDENTITY_REQUIRED'});
 user.email_confirmed_at='2026-11-12T00:00:00Z';const repo=createCustomerRepository({db,enabled:true});assert.equal((await repo.verify()).id,A);
 await assert.rejects(repo.createCase({applicationId:'NX-RECEIPT',accountId:'customer name',verificationReference:''}),{code:'VERIFIED_LINK_REQUIRED'});
});

test('account changes during listCases discard the previous account response',async()=>{
 let current=A;const user=()=>({id:current,email_confirmed_at:'2026-11-12T00:00:00Z'});
 const query={select(){return this},eq(){return this},order(){return this},async limit(){current=B;return {data:[{id:CASE_A}],count:1}}};
 const db={rpc:async()=>({data:true}),auth:{getSession:async()=>({data:{session:{user:user(),access_token:'SYNTHETIC_NOT_REAL_ACCESS_TOKEN',expires_at:9999999999}}}),getUser:async()=>({data:{user:user()}})},from:()=>query};
 await assert.rejects(createCustomerRepository({db,enabled:true}).listCases(),{code:'AUTH_CHANGED'});
});
