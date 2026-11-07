import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLegacyLinks, inspectSchemaContract} from './legacy-link-audit.mjs';
const u = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const plan = (n, app) => ({id:u(n),application_id:u(app)});
const job = (n, extras={}) => ({id:u(n),application_id:null,free_plan_id:null,idempotency_key:null,...extras});

test('legacy key resolves only when it exactly matches an existing plan UUID', () => {
  const out=summarizeLegacyLinks({plans:[plan(1,101)],jobs:[job(11,{idempotency_key:u(1)}),job(12,{idempotency_key:u(2)})]});
  assert.equal(out.viaLegacyKey,1);assert.equal(out.unresolved,1);assert.equal(out.autoRelinkPermitted,false);
});
test('two application groups with extra jobs are counted, not merged', () => {
  const out=summarizeLegacyLinks({plans:[plan(1,101),plan(2,102)],jobs:[
    job(11,{application_id:u(101)}),job(12,{idempotency_key:u(1)}),
    job(13,{application_id:u(102)}),job(14,{free_plan_id:u(2)})]});
  assert.equal(out.duplicateGroups,2);assert.equal(out.excessJobsInGroups,2);
  assert.equal(out.destructiveDedupPermitted,false);
});
test('conflicting direct and plan-derived application IDs are quarantined from counts', () => {
  const out=summarizeLegacyLinks({plans:[plan(1,101)],jobs:[job(11,{application_id:u(102),free_plan_id:u(1)})]});
  assert.equal(out.conflicting,1);assert.equal(out.direct,0);
});
test('missing foreign plan reference cannot be treated as a verified direct link', () => {
  const out=summarizeLegacyLinks({plans:[],jobs:[job(11,{application_id:u(101),free_plan_id:u(999)})]});
  assert.equal(out.missingPlanReferences,1);assert.equal(out.unresolved,1);
});
test('invalid and repeated synthetic IDs fail closed', () => {
  assert.throws(()=>summarizeLegacyLinks({plans:[plan(1,101),plan(1,102)],jobs:[]}),/invalid_plan_reference/);
  assert.throws(()=>summarizeLegacyLinks({plans:[],jobs:[job(11),job(11)]}),/invalid_job_reference/);
  assert.throws(()=>summarizeLegacyLinks({plans:[],jobs:[job(11,{application_id:'client-claim'})]}),/invalid_job_reference/);
});
test('summary never emits synthetic application or job IDs', () => {
  const out=summarizeLegacyLinks({plans:[plan(1,101)],jobs:[job(11,{idempotency_key:u(1)})]});
  assert.equal(JSON.stringify(out).includes(u(101)),false);
  assert.equal(JSON.stringify(out).includes(u(11)),false);
});
const cols = Object.entries({applications:['id','receipt_number','description','privacy_consent'],ai_work_plans:['id','application_id','plan'],orchestrator_jobs:['id','application_id','free_plan_id','idempotency_key'],admin_users:['user_id']})
  .flatMap(([table_name,names])=>names.map(column_name=>({table_name,column_name})));
test('actual-shaped schema reveals missing server tenant mapping and candidate field mismatch', () => {
  const out=inspectSchemaContract({columns:cols,edgeFunctions:[{slug:'nexus-production',verify_jwt:false}],evidence:{}});
  assert.equal(out.missingColumns.length,0);
  assert.ok(out.blockers.includes('tenant_boundary_requires_server_owned_mapping'));
  assert.ok(out.blockers.includes('candidate_field_names_require_explicit_server_mapping'));
  assert.ok(out.blockers.includes('jwt_disabled_edges_require_internal_auth_review'));
  assert.equal(out.deploymentPermitted,false);
});
test('even positive booleans are not deployment authority', () => {
  const out=inspectSchemaContract({columns:cols,edgeFunctions:[],evidence:{actualAuthRlsVerified:true,durableTransactionAdapterVerified:true,encryptedBackupRestored:true,legacyLinksReviewed:true}});
  assert.equal(out.deploymentPermitted,false);
});
test('missing schema and invalid metadata are rejected', () => {
  const out=inspectSchemaContract({columns:[],edgeFunctions:[],evidence:{}});
  assert.ok(out.blockers.includes('required_schema_columns_missing'));
  assert.throws(()=>inspectSchemaContract({columns:[{table_name:'applications'}],edgeFunctions:[],evidence:{}}),/invalid_column_metadata/);
});
