# SOLQ COMMAND — Orchestration v2: Dispatcher, ACK, Heartbeat, Owner Queue
Date: 2026-11-05. Mode: **candidate, not activated**. Production: **NO-GO**.

## Dispatch protocol
Source of truth: dev branch `ops/independent-runner/orchestration-queue.json`, `tasks.json`, and directives under `ops/independent-runner/directives/*.md` (actual path; not singular `directive/`).
A dispatcher detects changed directive SHA and task ID, checks dependencies, maps owners (GUARD backup, CORE restore, AUTO business smoke, SENTINEL security, FIN cost), and creates an immutable dispatch attempt with ID, target, revision, timestamp and idempotency key. GitHub commits are NOT delivery.
Dispatch adapter must be explicitly configured and authenticated; do not claim ChatGPT chat worker invocation from GitHub. When no adapter exists: `delivery_status=NOT_CONFIGURED`, state stays PENDING, escalation to ATLAS. Do not send customer data or credentials.

## ACK and acceptance
Delivery confirmed -> start 30-minute ACK deadline. ACK means worker read exact directive SHA; REJECT requires reason. ACCEPTED means scope, authority, prerequisites and actual executor verified. Only a verified worker response with run/task IDs can move states. ACK timeout triggers an **ESCALATION event**, not fabricated ACK or task completion. The existing daily 09:00 ATLAS automation cannot enforce a real-time 30-minute SLA; this requires an enabled event-driven or <=30-minute monitor.

## Heartbeat
Only verified IN_PROGRESS tasks require heartbeat every 60 minutes. Heartbeat fields: task_id, worker_id, run_id, directive_sha, observed_at, progress (optional, evidence based), next_action. At 120 minutes without heartbeat emit UNKNOWN/STALE alert; preserve last known task state and lease, do not infer failure or retry side-effecting work. An actual recurring monitor is required; daily polling is insufficient. Any retry checks lease, completion evidence and idempotency.

## Owner Action Queue
Each action: action_id, gate_id, required_by, owner, action, safe UI steps, forbidden actions, urgency, created_at, status (OPEN/WAITING_OWNER/RESOLVED/CANCELLED), expected_active_minutes_after_action (range and assumptions), evidence_needed, privacy restrictions. Deduplicate repeated requests. First action: Owner opens existing Supabase project Database → Backups and reports non-secret latest point, type, completion and download availability. No Restore/Clone/Reset/Upgrade and no secrets.

## Gate model
Gate-1 access; Gate-2 actual full encrypted backup/SHA256; Gate-3 isolated restore/integrity; Gate-4 measured RPO/RTO; Gate-5 security closure; Gate-6 PC/Android/iOS regression and rollback; Gate-7 approval package and explicit Owner O3 decision. Gate statuses: OPEN/IN_PROGRESS/WAITING_OWNER/BLOCKED/PASS/FAIL. Gate-7 must never auto-deploy.
READY_FOR_APPROVAL only when Gate-1..6 PASS with independently verifiable evidence, no unaccepted Critical/High risks, complete change list, rollback and residual-risk package. No automatic GO or main merge.

## Reporting and safety
Every BLOCKED/WAITING_OWNER/WAITING_COST report includes cause, approver, necessary authority/action, cost and cap, lawful fallback, unblock evidence, realistic time range and next gate. No unsupported fixed 2h/4h promise.
No production DB/Auth/RLS/SSL/Secrets/Vault modifications, main merge, deploy, customer notifications, paid APIs or new paid infrastructure without separate Owner approval. No private data or secrets in public repo/CI. Preserve 51 native nonproduction PASS evidence, do not rerun.
This protocol is **not** proof of an installed live dispatcher, heartbeat emitter, worker runtime or SLA monitor. Record their activation only after end-to-end tests with real ACK, accepted run, heartbeat, evidence, aggregation, timeout and deduplication.
