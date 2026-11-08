# SOLQ follow-up review — 2026-10-26 KST

Branch-only candidates. NO live database writes, deployment, merge, customer messages, paid calls, production, or payments.

## Confirmed cause of the fifth orchestration job

At 14:33:25.677 KST an authenticated administrator submission created the additional job; by 14:33:32.633 it was awaiting_approval. Event sequence: submitted → three internal claimed/completed stages → human_review awaiting_approval. Function logs show successful nexus-orchestrator POSTs at 14:33:25.810 and 14:33:32.752. The creator is the existing administrator identity, not the server worker (whose created_by is NULL). These records identify the authenticated request path, not which person or automation controlled that browser.

The hosted admin.js calls free.plan() and free.assign() when a recent customer card renders and every 30 seconds while signed in. The hosted free-workflow.js looks up orchestrator_jobs by idempotency_key = plan ID, then invokes submit when absent. The server worker uses idempotency_key = application ID and persists application_id/free_plan_id. Thus the page misses an existing server-generated job and submits a second job with the plan ID. The old submission function inserts only creator, key, instruction and agent; its new link columns remain NULL. The observed extra job's key equals the same stored plan ID, while the earlier correctly linked server job uses that application's ID. Code and timing corroborate the automatic browser submission. No new live reproduction was attempted because merely opening the authenticated page can write.

This is a logical duplicate across two registration paths despite distinct unique keys; it is not evidence that free_cycle itself duplicated a record. New candidate reads only server-linked rows by application_id and checks plan ownership; it never registers or ticks work. Old historical rows are neither repaired nor attached to customers.

## Live read-only integrity findings

- Applications 8; free plans 5; orchestration jobs 5; production jobs 5.
- Four orchestration jobs have missing application/plan links, including the extra job. They remain awaiting_approval. One canonical job has valid explicit links.
- Zero orphan plan-to-application links; zero duplicate application plan groups; zero mismatched explicit job-to-plan-to-application links. This does NOT mean all historical jobs are linked.
- One automatic free-plan run: one attempt, awaiting_approval, linked to the designated test application, its plan and canonical job.
- Production states: four awaiting_deposit, one cancelled; all attempt_count values zero. Quote acceptance records 0; production attempts 0; both configured execution providers disabled with approved_calls 0.
- Relevant public customer tables retain RLS. Plans, jobs, tasks and quote evidence have admin-only SELECT policies; normal customers are not mapped to auth.uid() in these tables. Their result portal uses the existing receipt + capability flow, not general table access. Customer self-service plan/quote ownership is not implemented by this candidate.
- No record was deleted, reassigned, approved, or payment-confirmed.

## Prepared changes

The hosted administrator shell differs from repository root admin.html/admin.js. Therefore the additive hosted-source candidates are kept HERE; do not deploy the repository root as a whole.

- admin.js: preserves hosted login, filters, customer status editor and support UI; removes page-driven plan/assignment creation; polling refreshes existing metadata only.
- free-workflow.js: read-only snapshot; application ID lookup, explicit plan match and duplicate detection; no mutation methods.
- plan-view.js: renders six stored detailed steps independently of the four-stage legacy engine task summary, with title/content/state and receipt/plan/job linkage. Unknown execution state is labeled as unrecorded; old plans without detail are labeled honestly. Rendering uses textContent.
- admin.html: existing hosted shell plus plan-view.js script. Existing public project origin remains in its CSP; no credentials were added.
- link-guard.sql: proposed transactional trigger rejects missing/partial customer links for executable work, plan-key browser submissions, mismatched customer/plan pairs, noncanonical keys, and reassignment of existing links. It does not backfill historical rows. It also blocks new general unlinked queued jobs; central manual-job creation must be reviewed before enabling this guard.

## New verification (existing broad suites not rerun)

`node --test tests/admin-readonly.test.mjs tests/follow-up-isolation.test.mjs`: 7 tests pass.

The isolated PGlite PostgreSQL harness submits 100 synthetic applications through Promise.all and schedules eight free-cycle calls. Result: plans 100, jobs 100, tasks 600; one correct canonical plan/job pair per application; zero mixed links or paid/production attempts. Retry uniqueness, bad link rejection, browser plan-key rejection and unlinked execution blocking pass. Admin-only SELECT boundaries mirrored from live deny all five relevant tables to anonymous and nonadmin identities even when granted SELECT. Browser read mocks reject foreign-plan/job links and duplicate results. Six-detail renderer preserves all six titles/content/states and literal untrusted text.

LIMIT: PGlite serializes calls in one process. This validates request contention simulation, referential integrity and deduplication, not 100 independent PostgreSQL sessions, SKIP LOCKED/advisory-lock contention, throughput, or a load-test SLA. Those remain unverified.

JavaScript syntax and diff whitespace checks pass. The Playwright PC/mobile test is prepared at tests/admin-integration-ui.cjs but could not run: no installed browser binary, and browser download returned truncated non-ZIP content. Consequently actual layout, production CSS overflow, login/lookup browser regression and physical mobile checks are NOT verified. No screenshots or visual pass are claimed. Set SOLQ_QA_STYLES to an exact copy of hosted styles.css before rerunning the synthetic browser test; use an environment with an installed Playwright browser.

## Quote acceptance integration review: NOT ready

Prepared quote-evidence API requires authenticated admin identity, application-scoped lookup, evidence verification, and server-derived verifier/time. Its proposed immutable trigger prevents update/delete. The live quote table currently has no rows. Neither the new recording API nor immutable trigger has been deployed. A reference entered by an admin does not independently prove real customer consent.

Four required production prerequisites are only partially encoded:

| Requirement | Current evidence / gap |
|---|---|
| Customer accepts the quote | Live approval/claim guards require a linked acceptance row for the same application; prepared admin recording API exists. Missing authoritative issued-quote registry, active version matching, expiry/revocation rules. A nonempty version string alone is insufficient. |
| Deposit KRW 30,000 | Live code checks deposit_confirmed/in_progress status and payment_observed_at. It does NOT verify a stored KRW 30,000 amount or bank transaction evidence. |
| Admin manually confirms payment | Existing admin-controlled status and approval checks exist; missing separate immutable confirmer/time/amount/transaction reference record. |
| Separate admin production approval | Existing approve function verifies admin role and records production_approved_by/at; queue/claim and DB guards check it. |

Quote evidence alone cannot authorize production in the current gates. However, the four-condition requirement is NOT fully validated end-to-end. Keep production providers disabled and do not send real quotes, confirm payment, or approve production during this follow-up.

Before quote deployment, prepare an issued-quote/version-validity model and immutable admin-reviewed deposit ledger; bind both to the same application; reject stale quote and insufficient/mismatched deposit; recheck at approval, queuing, and claim. Test all missing-condition combinations with synthetic data. The hosted admin also lacks the global client hook used by quote-evidence-admin.js; integrate explicitly with the existing scoped client/session after the model is ready. Do not weaken RLS or expose a service-role key.

## Operational blockers and approval scope

No deployment is authorized in this task. The live automatic-browser duplication risk remains until a verified candidate is approved and deployed; avoid opening a live administrator page solely to reproduce it.

First finish PC/mobile synthetic UI checks and, if an available isolated PostgreSQL environment exists, real multi-session contention testing without creating a new hosted project. Then request approval for ONLY the four hosted candidate asset replacements and the link-guard trigger. Quote UI/API integration and the additional quote/deposit data model require a separate concrete review and approval; they are not included in this candidate.

Before any approval request: preserve exact hosted asset versions and pg_get_functiondef/ACL for changed functions or triggers in protected recovery storage, capture read-only counts/link diagnostics, and ensure no concurrent deployment changed the reviewed source. Deploy only the reviewed asset set, never a stale root checkout.

Rollback: before deployment this branch has no operational effect. If the SQL transaction fails, ROLLBACK the entire transaction. After a later approved rollout, restoring the old administrator JavaScript would reintroduce write-on-view: use a temporary read-only administrator maintenance page instead until a fixed version is available. Remove only solq_customer_link_guard and its private guard_customer_link() function if the new guard is the cause of a verified regression, under explicit operator approval; keep provider execution disabled. Never delete jobs, reset customer statuses, rewrite plans or remove existing quotation/production guards. Do not run the older free-automation emergency rollback for this UI candidate.

## Separate existing advisory

Security advisor reports pre-existing exposed SECURITY DEFINER submission/lookup functions and leaked-password protection disabled. No security settings were changed and none is attributed as the duplicate cause. Review function bodies and intended public intake/capability design before changing grants. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
