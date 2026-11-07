/**
 * SOLQ candidate-only protected authentication and write-readiness contract.
 * NOT wired to Edge, cron, production DB, or customer requests.
 * A positive authorization result is meaningful only with a real Supabase
 * Auth response, the user's RLS-scoped admin_users row, and a server-owned
 * tenant lookup. The live schema currently lacks a tenant mapping.
 */
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const JWT_HEADER = /^Bearer [A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}$/;
const uuid = value => typeof value === 'string' && UUID.test(value);

export function createProtectedAdminAuthorizer({url, publishableKey, fetchFn = fetch, lookupTenant} = {}) {
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url) ||
      typeof publishableKey !== 'string' || !publishableKey || publishableKey.startsWith('sb_secret_') ||
      typeof fetchFn !== 'function') throw Error('invalid_server_auth_configuration');
  const base = url.replace(/\/$/, '');
  return async function authorize(context, scope) {
    // Ignore context.userId, context.role, context.verifiedByServer and all
    // user_metadata. Only the validated bearer JWT identifies a user.
    if (!uuid(scope?.applicationId) || !uuid(scope?.tenantId) || scope?.action !== 'free_plan' ||
        typeof lookupTenant !== 'function' || !JWT_HEADER.test(context?.authorization ?? '')) return false;
    const headers = {apikey: publishableKey, Authorization: context.authorization};
    try {
      const userResponse = await fetchFn(`${base}/auth/v1/user`, {
        method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(5000)
      });
      if (!userResponse.ok) return false;
      const user = await userResponse.json();
      if (!uuid(user?.id)) return false;
      const adminResponse = await fetchFn(`${base}/rest/v1/admin_users?select=user_id&user_id=eq.${user.id}`, {
        method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(5000)
      });
      if (!adminResponse.ok) return false;
      const rows = await adminResponse.json();
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.user_id !== user.id) return false;
      // This lookup MUST be implemented with a trusted server-side data source.
      // It must not echo the client's tenantId; current SOLQ schema lacks it.
      const actualTenant = await lookupTenant(scope.applicationId, {verifiedUserId: user.id});
      return uuid(actualTenant) && actualTenant === scope.tenantId;
    } catch {
      return false;
    }
  };
}

/** Metadata-only gate: cannot authorize writes even if supplied with positive flags. */
export function inspectAtomicStorageReadiness({indexes, evidence} = {}) {
  if (!Array.isArray(indexes) || !evidence || typeof evidence !== 'object') throw Error('invalid_atomic_evidence');
  const hasUnconditionalUnique = (table, column) => indexes.some(i => {
    if (i?.tablename !== table || typeof i?.indexdef !== 'string') return false;
    const definition = i.indexdef.replace(/\s+/g, ' ').trim();
    const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return /^CREATE UNIQUE INDEX\b/i.test(definition) &&
      new RegExp(`\\bON (?:public\\.)?${table}\\b[^()]*\\(\\s*${escaped}\\s*\\)`, 'i').test(definition) &&
      !/\bWHERE\b/i.test(definition);
  });
  const blockers = [];
  if (!hasUnconditionalUnique('applications', 'receipt_number')) blockers.push('receipt_uniqueness_unproven');
  if (!hasUnconditionalUnique('ai_work_plans', 'application_id')) blockers.push('one_plan_per_application_unproven');
  if (!hasUnconditionalUnique('orchestrator_jobs', 'application_id')) blockers.push('one_job_per_application_not_unconditional');
  if (evidence.realPostgresSingleTransaction !== true) blockers.push('real_postgres_transaction_unverified');
  if (evidence.auditRollbackOnFailure !== true) blockers.push('durable_audit_rollback_unverified');
  if (evidence.legacyConflictResolutionReviewed !== true) blockers.push('legacy_link_conflicts_unreviewed');
  if (evidence.encryptedFullBackupRestored !== true) blockers.push('encrypted_backup_restore_unverified');
  return Object.freeze({status: 'candidate_only', writePermitted: false, blockers: Object.freeze(blockers)});
}
