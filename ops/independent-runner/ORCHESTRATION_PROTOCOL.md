# SOLQ COMMAND — Orchestration protocol v1 (candidate)

**Date:** 2026-11-05. **Status:** Candidate protocol; autonomous worker delivery NOT verified. **Deployment:** NO-GO.

## Authoritative separation
- Directive = instruction, not proof of delivery.
- Queue entry = pending work, not ACK.
- ACK = authenticated worker actually read exact directive revision.
- ACCEPTED = worker explicitly confirmed capability, allowed scope, executor and prerequisites.
- IN_PROGRESS = execution started with a unique run ID and lease.
- DONE = artifact, evidence and acceptance checks independently verifiable.
- No worker chat, external process, or GitHub Action may be represented as running without execution evidence.

## State machine
PENDING → ACK → ACCEPTED → IN_PROGRESS → DONE.
IN_PROGRESS → BLOCKED | WAITING_OWNER | WAITING_COST | FAILED.
ACK/ACCEPTED → BLOCKED | WAITING_OWNER | WAITING_COST.
BLOCKED/WAITING_OWNER/WAITING_COST → ACCEPTED only after unblock evidence and revalidation.
FAILED → PENDING only by ATLAS decision after idempotency and side-effect review.
DONE is immutable except through a new task revision; never silently reset it.

**ACK is an event, not proof of execution.** State ACK records receipt only.
**REJECT** is an event with reason and disposition; do not mark ACCEPTED.
**Timeout** is a monitoring alert, never an inferred REJECT/ACK.

## Dispatch and ACK SLA
When an enabled, authenticated delivery mechanism exists, ATLAS creates a uniquely versioned directive/task ID and dispatch event with worker target, source commit, issue time, scope, permissions, and idempotency key.
ACK or REJECT is required within 30 minutes **of verified delivery**, not merely GitHub commit creation. Without live delivery/monitoring, mark `DELIVERY_UNVERIFIED` and do not claim 30-minute compliance.
After ACK, ACCEPT/REJECT requires executor capability and access validation. If unavailable, report WAITING_OWNER/BLOCKED.
A scheduled ATLAS run at 09:00 KST does **not** provide a 30-minute dispatch SLA.

## Task claim and concurrency
Single writer or compare-and-swap with GitHub blob SHA; run_id, worker, started_at, lease_expires_at, attempt, directive_sha, evidence URLs.
One active claimant per task. Before retrying expired leases, inspect actual side effects. No duplicate backup, restoration, billing or production operation.
Each state transition records timestamp, actor, reason, previous state, new state, evidence, and next action. State transitions without execution evidence are prohibited.

## Gate map
Gate-1 = O1-A/O1-B access; Gate-2 = B1 actual full encrypted backup and SHA-256; Gate-3 = O2-A isolation plus O2-B real restore; Gate-4 = RPO/RTO measured; Gate-5 = security closure; Gate-6 = PC/Android/iOS regression and tested rollback; Gate-7 = approval package and explicit Owner O3 GO request. Gate-7 is not production authorization.
For each gate define PASS/FAIL/BLOCKED/WAITING_OWNER/WAITING_COST and evidence. Do not conflate access confirmation with completed backup.

## Mandatory BLOCKED/WAITING_OWNER/WAITING_COST report
Task ID; worker; directive SHA; state; observed_at; specific cause and evidence; authorized decision maker; required permission/action; minimum Owner UI step; estimated additional cost and approval limit; legal safe alternative; unblock criteria; post-unblock active time estimate range and assumptions; next gate; retry conditions.
Estimates must distinguish measured versus planned and external waiting. Unknown sizes/speeds mean unknown ETA; do not promise 2h backup/4h restore without evidence.

## Responsibility and execution reality
ATLAS: intake, de-duplication, dependency check, dispatch only via verified mechanism, aggregation and Owner request.
GUARD: Gate-1/2/3/4 evidence and independent PASS.
CORE: isolated restore prerequisites, Gate-6 browser/device and rollback.
AUTO: synthetic functional smoke after real isolated restore.
SENTINEL: security risks and approval matrix.
FIN: cost bounds, no paid creation.
GitHub alone does not awaken ChatGPT worker conversations. Do not fabricate ACK/ACCEPT. If no independent worker runtime exists, ATLAS may perform permitted read-only tasks itself and attribute execution to ATLAS, not the named worker.

## Initial baseline (no invented activity)
Existing platform evidence 51 PASS/0 FAIL reused; O1 WAITING_OWNER (actual Owner UI unavailable); O2 BLOCKED (isolation/egress unverified); actual encrypted backup/restore 0; RPO/RTO unmeasured; security/device gates incomplete; O3 not approved.
All new worker tasks begin PENDING with `delivery_status: NOT_DISPATCHED` until a real mechanism delivers them.

## Security boundaries
No operating DB/data/Auth/RLS/SSL/Vault/Secrets changes, main merge, production deployment, customer notifications, paid API or new paid resources without explicit separate approval. No customer data or credentials in public GitHub/CI. Owner Backups screen is read-only; no Restore/Clone/Reset/Upgrade click.
