# Preservation and follow-up review — 2026-10-26

Status: branch only; no merge, deployment, live SQL write or customer communication.

## Preserved implementation

Existing automated rule-based free planning, production gates, isolated PostgreSQL tests and data-preserving emergency rollback are included. Added files contain schema and synthetic test fixtures only, not database row exports or credentials. The historical baseline fixture's live project URL was replaced before publication. This branch starts directly from the recorded main and excludes unpublished intermediate history; a follow-up documentation commit records authenticated UI findings.

## Prepared evidence connection

Administrator lookup displays the application's free six-step plan, linked work status and quotation evidence. An authenticated API supports scoped lookup and admin-verified external evidence registration. The database records application, amount, version, actual acceptance time, evidence reference and server-derived verifier/recording time. Anonymous/nonadmin recording and direct client writes are blocked. Records are immutable, and the linked quote cannot be replaced through this workflow. Evidence registration leaves production awaiting deposit and does not grant production approval.

This workflow records an administrator's verification of externally retained evidence. It cannot independently prove that an external reference contains genuine customer consent. No real consent was fabricated or recorded. Customer self-service signing and audited quote supersession are outside this implementation.

## Verification

26 tests passed with synthetic data and mocked API responses; the SQL integration test uses isolated PGlite PostgreSQL. Covers isolation, idempotency, rollback/retry, unauthorized evidence registration, forged verifier rejection, future acceptance time rejection, immutable evidence, duplicate locking, and no production on acceptance alone. JavaScript syntax and git diff whitespace checks passed. No real model endpoint was called.

Read-only live checks: applications 8; free plans 5; evidence 0; production attempts 0. The designated synthetic application retains one plan with six details, one awaiting_approval job, six tasks, and awaiting_deposit production. Cross-customer free-plan/job links and duplicate plan groups: 0. The one synthetic application is separately identifiable. Existing cron was not manually invoked.

The administrator signed in through the secure browser flow. The designated synthetic receipt was filtered to one application; the screen showed its stored plan ID, job ID and administrator approval waiting status. The current live UI shows only four summary task items, not all six detailed stored plan steps. Full six-step display is therefore unverified/incomplete. No authentication or RLS changes were made. Live UI and API connection remain unverified because deployment is prohibited. The repository admin shell predates the live design: reconcile the additive panel with current hosted source before future deployment.

## Rollback and next work

Leave main and hosting untouched. This branch has no operational effect, so abandoning it needs no DB rollback. For a later authorized deployment, follow README.md deployment and reversal order. Preserve evidence, immutable protections and all three production prerequisites. The separate emergency rollback.sql may stop free automation and must not be executed during this task.

After login, orchestrator job count increased from 4 to 5. The new job is awaiting_approval with NULL application_id/free_plan_id; the page advertises background free-job linking, so that is the suspected source, not a fully verified attribution. Application and plan counts stayed 8 and 5; evidence and production attempts stayed 0. No create/assign/status-save button was pressed. The administrator tab was closed to stop further page-driven work. This observed change is separate from this branch, which was not deployed.

Next: reconcile the six-detail display and automatic browser job linking with the existing server worker, review the prepared code and current live shell, and separately authorize any production deployment. No actual quote sending, deposit confirmation, production approval, new infrastructure, paid API or payment occurred.
