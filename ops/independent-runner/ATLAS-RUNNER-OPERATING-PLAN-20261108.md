# SOLQ COMMAND — Independent orchestration implementation decision
Date: 2026-11-08 KST
Status: DEVELOPMENT PLAN / PRODUCTION NO-GO
Owner direction: integrate Sites-facing operations, free executor, independent reporting, collision/recovery/retry controls, and a measured 24-hour unattended test.

## Architectural decision
- ATLAS = policy, prioritization, approval authority and reporting.
- Sites = user-facing management console and planning, NOT a guaranteed always-on scheduler or authenticated worker launcher.
- Codex = development and code-review executor when explicitly invoked and authorized, NOT the permanent scheduler.
- Independent orchestrator = machine-executable, auditable dispatcher, lease controller, result collector and recovery coordinator.
- Free GitHub Actions = bounded execution backend for allowlisted non-production tasks; not a persistent server and not a guarantee of exact-time or continuous availability.
- GUARD = independent test evidence and GO/NO-GO gate.

## Minimum implementation contract
1. Ingress: validate signed or permissioned task request against schema (task_id, revision, worker, action, input_ref, idempotency_key, created_at, scope, approval_class).
2. Allowlist: no arbitrary shell, arbitrary repository code from untrusted issue text, external paid API, customer data, production credentials, deployment, database mutations or financial operations.
3. Dispatch: explicit delivery event and executor acknowledgement; queued GitHub JSON is not proof of delivery.
4. Concurrency: one authoritative claim per task revision via compare-and-swap or transactional unique constraint; immutable run_id and lease token; stale lease recovery must inspect side effects first.
5. Retries: exponential backoff with jitter, bounded attempts, permanent failures quarantined; never auto-retry non-idempotent operations.
6. Evidence: durable append-only events PENDING, DISPATCHED, ACK, ACCEPTED, RUNNING, DONE/FAILED/BLOCKED, with actor, timestamps, commit SHA, run ID, safe logs and acceptance evidence.
7. Monitoring: heartbeat, overdue alert, task-age metrics, queue-depth, last successful execution, executor outage and missed-schedule detection; no success claims based on scheduling alone.
8. Recovery: restart from persisted state; replay detection; no duplicated external effects; manual intervention required when side effects cannot be proven.
9. Approval: separate explicit Owner approval for production deploy, secrets, paid resources, backup/restore, customer data, outbound communication, and payments.

## Test plan
- Schema reject; authorization reject; duplicate task; duplicate dispatch; concurrent claim; lease expiry; crash before/after side effect; retry exhaustion; offline executor; schedule delay; audit completeness.
- Run synthetic non-sensitive workload over at least 24 consecutive elapsed hours, with independent timestamped evidence and documented gaps. Measure completion, collision count, duplicate side effects, retry success, heartbeat availability, mean recovery time.
- PASS only if test duration >=24h, no unauthorized actions, no duplicate side effects, evidence complete, expected scheduled windows accounted for, and failure recovery demonstrated. Record platform gaps explicitly. A 24-hour test does not prove perpetual availability.

## Existing blockers
Current orchestration-queue.json says candidate_not_activated and NOT_DISPATCHED. Protocol warns GitHub does not wake ChatGPT chats. Existing backup/restore/security/rollback gates remain blocked. Do not change production merely because the Owner requests implementation; validate safe rollback and protections first.

## Execution order
A. Implement and test schema, dispatcher, concurrency lease and evidence in isolated branch.
B. Connect a verified GitHub Actions manual-dispatch test with least-privilege token and no secrets.
C. Activate a non-production schedule only after verified permissions and controls; observe >=24h.
D. GUARD independently reviews traces and gate results.
E. Present production change package including rollback, security and explicit deployment approval; do not merge to main until gates PASS.

## Current execution evidence
This document records architecture and acceptance criteria only. No live worker dispatch, workflow activation, 24-hour runtime or production deployment is claimed.
