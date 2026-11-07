import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedAdminAuthorizer, inspectAtomicStorageReadiness} from './protected-contract.mjs';
const u = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const JWT = 'Bearer abc.def.ghi';
const scope = {applicationId: u(101), tenantId: u(102), action: 'free_plan'};
const base = {url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test'};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
function mock({authStatus=200, adminRows=[{user_id:u(1)}], userId=u(1)}={}) {
  const calls=[];
  const fetchFn=async (url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/auth/v1/user')) return json({id:userId},authStatus);
    if(url.includes('/rest/v1/admin_users?')) return json(adminRows);
    throw Error('unexpected_url');
  };
  return {fetchFn,calls};
}

test('no server-owned tenant mapping means fail closed without any network request',async()=>{
  const m=mock(); const a=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn});
  assert.equal(await a({authorization:JWT},scope),false);assert.equal(m.calls.length,0);
});
test('missing or malformed JWT rejected before Auth API',async()=>{
  const m=mock();const a=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn,lookupTenant:async()=>scope.tenantId});
  assert.equal(await a({authorization:'Bearer attacker'},scope),false);
  assert.equal(await a({},scope),false);assert.equal(m.calls.length,0);
});
test('forged client role, userId and verifiedByServer cannot bypass absent admin row',async()=>{
  const m=mock({adminRows:[]});const a=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn,lookupTenant:async()=>scope.tenantId});
  assert.equal(await a({authorization:JWT,role:'admin',userId:u(1),verifiedByServer:true},scope),false);
  assert.equal(m.calls.length,2);
});
test('actual Auth identity + RLS-visible own admin row + trusted tenant scope allow candidate authorization',async()=>{
  const m=mock();let checked;
  const a=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn,lookupTenant:async(app,identity)=>{checked={app,identity};return scope.tenantId;}});
  assert.equal(await a({authorization:JWT},scope),true);
  assert.deepEqual(checked,{app:scope.applicationId,identity:{verifiedUserId:u(1)}});
  assert.equal(m.calls.length,2);
  for(const call of m.calls){assert.equal(call.options.headers.Authorization,JWT);assert.equal(call.options.headers.apikey,base.publishableKey);}
});
test('trusted tenant mismatch denies despite valid administrator session',async()=>{
  const m=mock();const a=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn,lookupTenant:async()=>u(999)});
  assert.equal(await a({authorization:JWT},scope),false);
});
test('Auth failure and wrong admin row both deny',async()=>{
  const m1=mock({authStatus:401});const a1=createProtectedAdminAuthorizer({...base,fetchFn:m1.fetchFn,lookupTenant:async()=>scope.tenantId});
  assert.equal(await a1({authorization:JWT},scope),false);
  const m2=mock({adminRows:[{user_id:u(7)}]});const a2=createProtectedAdminAuthorizer({...base,fetchFn:m2.fetchFn,lookupTenant:async()=>scope.tenantId});
  assert.equal(await a2({authorization:JWT},scope),false);
});
test('backend exceptions and server tenant lookup failures deny without retries',async()=>{
  let calls=0;const a=createProtectedAdminAuthorizer({...base,fetchFn:async()=>{calls++;throw Error('network');},lookupTenant:async()=>scope.tenantId});
  assert.equal(await a({authorization:JWT},scope),false);assert.equal(calls,1);
  const m=mock();const b=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn,lookupTenant:async()=>{throw Error('lookup');}});
  assert.equal(await b({authorization:JWT},scope),false);
});
test('unapproved action or invalid scope denied without backend calls',async()=>{
  const m=mock();const a=createProtectedAdminAuthorizer({...base,fetchFn:m.fetchFn,lookupTenant:async()=>scope.tenantId});
  assert.equal(await a({authorization:JWT},{...scope,action:'production'}),false);
  assert.equal(await a({authorization:JWT},{...scope,applicationId:'not-uuid'}),false);
  assert.equal(m.calls.length,0);
});
test('reject server configuration containing a secret API key',()=>{
  assert.throws(()=>createProtectedAdminAuthorizer({...base,publishableKey:'sb_secret_no'}),/invalid_server_auth_configuration/);
});
const indexes=[
  {tablename:'applications',indexdef:'CREATE UNIQUE INDEX applications_receipt_number_key ON public.applications USING btree (receipt_number)'},
  {tablename:'ai_work_plans',indexdef:'CREATE UNIQUE INDEX ai_work_plans_one_per_application ON public.ai_work_plans USING btree (application_id)'},
  {tablename:'orchestrator_jobs',indexdef:'CREATE UNIQUE INDEX solq_one_free_job_per_application ON public.orchestrator_jobs USING btree (application_id) WHERE (free_plan_id IS NOT NULL)'},
  {tablename:'orchestrator_jobs',indexdef:'CREATE UNIQUE INDEX orchestrator_jobs_idempotency_key_key ON public.orchestrator_jobs USING btree (idempotency_key)'}
];
test('actual-shaped indexes prove receipt and plan uniqueness, not unconditional job uniqueness',()=>{
  const r=inspectAtomicStorageReadiness({indexes,evidence:{}});
  assert.equal(r.writePermitted,false);
  assert.ok(!r.blockers.includes('receipt_uniqueness_unproven'));
  assert.ok(!r.blockers.includes('one_plan_per_application_unproven'));
  assert.ok(r.blockers.includes('one_job_per_application_not_unconditional'));
  assert.ok(r.blockers.includes('real_postgres_transaction_unverified'));
});
test('idempotency-key unique index is not application-level uniqueness',()=>{
  const r=inspectAtomicStorageReadiness({indexes:indexes.filter(x=>!x.indexdef.includes('free_job')),evidence:{}});
  assert.ok(r.blockers.includes('one_job_per_application_not_unconditional'));
});
test('even all positive evidence flags cannot grant production writes from a candidate gate',()=>{
  const r=inspectAtomicStorageReadiness({indexes:[...indexes,{tablename:'orchestrator_jobs',indexdef:'CREATE UNIQUE INDEX test ON public.orchestrator_jobs USING btree (application_id)'}],evidence:{realPostgresSingleTransaction:true,auditRollbackOnFailure:true,legacyConflictResolutionReviewed:true,encryptedFullBackupRestored:true}});
  assert.equal(r.blockers.length,0);assert.equal(r.writePermitted,false);
});
test('invalid metadata rejected rather than interpreted as approval',()=>{
  assert.throws(()=>inspectAtomicStorageReadiness({indexes:null,evidence:{}}),/invalid_atomic_evidence/);
});
