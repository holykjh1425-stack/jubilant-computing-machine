# SOLQ: explicit approval before free generation

Candidate on dev/solq-automation-preservation-20261026, based on 8b3badc. Not applied to production. This supersedes the old automatic free-generation portion of prior release plans; it does not authorize a deployment.

## Behavior

Customer submission/receipt issuance is unchanged. The administrator list restores and reads without generation. A 30-second poll reads the application count and displays an in-page new-intake notice; it never creates plans or jobs. Notification is in-page only, not an external message. The list must be refreshed to review new records.

Each application has separate “무료 계획 생성 승인” and “승인된 무료 계획·작업 생성” buttons. The first stores only a private, immutable approval bound to the current service/description hash and the actual administrator. The second runs the SQL RPC and generates the existing six-stage rules-only free plan and one linked job. Stages 1–5 contain deterministic free analysis; stage 6 remains awaiting human approval. No generative model, paid API, payment confirmation, paid production, or customer delivery runs.

The RPC validates auth.uid() and current admin_users membership. Direct plan/job inserts require a valid current approval; crafted plan bodies are rejected. Existing request RLS and paid-production gates remain in place. Inspect performs SELECT only. Mutating actions serialize using an application FOR UPDATE lock; the existing unique application/plan/key constraints remain the final duplicate barrier. The prior link guard blocks orphan customer-key registration. Existing complete pairs are returned unchanged. Existing logical duplicates/orphans require manual review and block generation; no cleanup/backfill occurs.

The legacy nexus_production_private.free_cycle() becomes a no-op. Cron scheduling itself and unrelated worker/production functions are untouched. Pending historical run records are not rewritten. This intentionally retires automatic free-plan capture, including server-side scheduled generation, not just the browser timer.

## Evidence and limits

New evidence: tests/free-generation/results.json (actual PostgreSQL-compatible SQL on disposable PGlite with synthetic 9/6/7 history), client-results.json (synthetic DOM/SDK). See individual test names. The 20 concurrent calls use one queued PGlite engine; they are not independent PostgreSQL sessions. Existing native 100-connection/RLS and quote/deposit PASS evidence is retained, not rerun, and does not prove the NEW approval RPC on native connections.

Actual Supabase JWT/admin-screen integration, PostgREST schema discovery, native independent-session contention and real-device mobile behavior remain unverified. Synthetic identities are never treated as real authentication. No production write, deployment, customer communication or production execution was performed.

Read-only production check on 2026-10-27: applications=9, plans=6, jobs=7. Jobs fingerprint cdf5a01b412ee35d7e718389c9c1d25e and tasks fingerprint 431e4ee768fd3c8bd69e8ba7dc5255d9 match prior evidence. No customer information is included in fixtures or reports. Counts and unchanged job/task fingerprints do not independently prove full application/plan content equality; no writes to those tables were issued.

Run only local synthetic validation:

    cd tests/free-generation
    npm ci --ignore-scripts --no-audit --no-fund
    npm test

No database URL, production credential, or external database connection is accepted by these tests. PGlite is in memory. The fixture's auth.uid function simulates JWT identity; it is not a Supabase Auth login.

## Files / application order (requires separate approval)

1. Keep deployment 22 and main unchanged until all gates below pass. Preserve previously prepared quote/payment and duplicate-guard changes; this is an addition to that candidate, not a substitute for its other required files.
2. Before SQL deployment, secure a complete encrypted logical backup and verify restoration in an approved existing isolated environment. Backup preparation remains on hold; no backup/restore was executed here. Verify production application_id uniqueness on ai_work_plans and solq_one_free_job_per_application uniqueness, and compare live function/table signatures with the candidate.
3. In one reviewed transaction apply ops/admin-integration-candidate/link-guard.sql, the previously prepared quote/deposit gate where required, then approval-gate.sql. Existing data must not be repaired to make constraints pass. Stop and roll back the transaction on any failed prerequisite/index/trigger.
4. Publish/reload the PostgREST schema through the approved official path if needed. Preserve existing guarded Edge orchestrator/worker handlers; old unsafe plan/assign endpoints must not be redeployed. Validate the new SQL RPC with real authorized/unauthorized JWTs in a nonproduction environment first.
5. Deploy admin.html, admin.js and new free-generation.js together with prior release-required assets (free-workflow.js, plan-view.js, quote panel/flow and guarded Edge handlers). Use the current branch versions, not the stale 19-file manifest. Check cache/CSP includes the new same-origin asset. No root deployment configuration or public customer submission code is changed by this addition.
6. Verify restored session + login + 30-second polling cause SELECT/inspect only; one explicit approval, then generation, then repeated independent-session requests yield one pair. Verify no paid execution/payment/production approval or customer send. Read-only compare production counts/fingerprints and policy/permission definitions before/after any separately authorized rollout.

## Rollback / risks / outstanding approval

A SQL error before commit must ROLLBACK the entire transaction. After commit, prefer rolling back the UI to the previously prepared read-only candidate while retaining approval ledger/guards/no-op free_cycle. Never roll back to automatic generation or drop approval protections just to restore old behavior. Do not delete generated rows or historical duplicates. A complete SQL rollback requires a separately reviewed script and explicit approval because restoring automatic free_cycle would contradict the new policy. Retain the baseline function definitions and backup for review, not automatic restoration.

Risks: lock contention under load, older clients rejected by guards, incomplete historic plans requiring review, revoked approvers requiring an explicit future remediation policy, and mismatched live schema/API. Approval does not bypass separate paid-production controls. Inspect reuses existing historical work without marking it as newly approved.

Ready: code candidate + local SQL/DOM evidence. Not ready for production: encrypted full backup/isolated restore, real Auth/PostgREST/Edge integration and native contention validation remain gates. Separate approval is required for production SQL, main merge, hosting/Edge deployment and any customer send or production run. No such approval was requested or assumed here.
