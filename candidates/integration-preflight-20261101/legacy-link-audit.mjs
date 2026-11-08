// Candidate-only, side-effect-free audit. No database access, no identifiers in output.
// This module is NOT a migration, authorization adapter, or automatic relinker.
const id = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const optionalId = value => value == null || id(value);

export function summarizeLegacyLinks({ jobs, plans }) {
  if (!Array.isArray(jobs) || !Array.isArray(plans)) throw Error('invalid_audit_input');
  const byPlan = new Map();
  for (const plan of plans) {
    if (!id(plan?.id) || !id(plan?.application_id) || byPlan.has(plan.id)) throw Error('invalid_plan_reference');
    byPlan.set(plan.id, plan.application_id);
  }
  const seenJobs = new Set();
  const counts = { jobs: jobs.length, plans: plans.length, direct: 0, viaPlan: 0, viaLegacyKey: 0,
    unresolved: 0, conflicting: 0, missingPlanReferences: 0, duplicateGroups: 0, excessJobsInGroups: 0 };
  const resolvedCounts = new Map();
  for (const job of jobs) {
    if (!id(job?.id) || seenJobs.has(job.id) || !optionalId(job.application_id) ||
        !optionalId(job.free_plan_id) || !optionalId(job.idempotency_key)) throw Error('invalid_job_reference');
    seenJobs.add(job.id);
    const candidates = new Set();
    if (job.application_id) candidates.add(job.application_id);
    if (job.free_plan_id) {
      const appId = byPlan.get(job.free_plan_id);
      if (appId) candidates.add(appId);
      else counts.missingPlanReferences++;
    }
    // Legacy idempotency keys are sometimes plan UUIDs, not universally.
    const legacy = job.idempotency_key ? byPlan.get(job.idempotency_key) : undefined;
    if (legacy) candidates.add(legacy);
    if (candidates.size > 1) { counts.conflicting++; continue; }
    if (job.free_plan_id && !byPlan.has(job.free_plan_id)) { counts.unresolved++; continue; }
    if (!candidates.size) { counts.unresolved++; continue; }
    const appId = [...candidates][0];
    if (job.application_id) counts.direct++;
    else if (job.free_plan_id) counts.viaPlan++;
    else if (legacy) counts.viaLegacyKey++;
    resolvedCounts.set(appId, (resolvedCounts.get(appId) ?? 0) + 1);
  }
  for (const n of resolvedCounts.values()) if (n > 1) {
    counts.duplicateGroups++;
    counts.excessJobsInGroups += n - 1;
  }
  // No IDs, customer text, receipts, or credentials leave this function.
  return Object.freeze({ ...counts, autoRelinkPermitted: false, destructiveDedupPermitted: false });
}

export function inspectSchemaContract({ columns, edgeFunctions, evidence }) {
  if (!Array.isArray(columns) || !Array.isArray(edgeFunctions) || !evidence || typeof evidence !== 'object') throw Error('invalid_contract_input');
  const tables = new Map();
  for (const item of columns) {
    if (typeof item?.table_name !== 'string' || typeof item?.column_name !== 'string') throw Error('invalid_column_metadata');
    if (!tables.has(item.table_name)) tables.set(item.table_name, new Set());
    tables.get(item.table_name).add(item.column_name);
  }
  const required = {
    applications: ['id', 'receipt_number', 'description', 'privacy_consent'],
    ai_work_plans: ['id', 'application_id', 'plan'],
    orchestrator_jobs: ['id', 'application_id', 'free_plan_id', 'idempotency_key'],
    admin_users: ['user_id'],
  };
  const missing = [];
  for (const [table, names] of Object.entries(required)) for (const name of names)
    if (!tables.get(table)?.has(name)) missing.push(table + '.' + name);
  const blockers = [];
  if (missing.length) blockers.push('required_schema_columns_missing');
  // Existing public.applications has no tenant_id. Never invent it from client JSON.
  if (!tables.get('applications')?.has('tenant_id')) blockers.push('tenant_boundary_requires_server_owned_mapping');
  if (!tables.get('applications')?.has('receipt') || !tables.get('applications')?.has('brief'))
    blockers.push('candidate_field_names_require_explicit_server_mapping');
  if (edgeFunctions.some(f => ['nexus-agent-worker', 'nexus-production'].includes(f.slug) && f.verify_jwt === false))
    blockers.push('jwt_disabled_edges_require_internal_auth_review');
  if (evidence.actualAuthRlsVerified !== true) blockers.push('real_auth_rls_integration_unverified');
  if (evidence.durableTransactionAdapterVerified !== true) blockers.push('durable_transaction_adapter_unverified');
  if (evidence.encryptedBackupRestored !== true) blockers.push('full_encrypted_backup_restore_unverified');
  if (evidence.legacyLinksReviewed !== true) blockers.push('legacy_link_mapping_unreviewed');
  // Diagnostic flags cannot grant deployment approval, even if supplied as true.
  return Object.freeze({ status: 'candidate_only', deploymentPermitted: false,
    missingColumns: Object.freeze(missing), blockers: Object.freeze(blockers) });
}
