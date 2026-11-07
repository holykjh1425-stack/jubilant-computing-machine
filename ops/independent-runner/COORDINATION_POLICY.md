# SOLQ worker coordination policy (candidate)

## Single source of truth
- GitHub `ops/independent-runner/tasks.json` is the canonical **candidate** work ledger.
- This chat coordinates instructions and reports, but cannot directly control or wake existing Work sessions.
- A worker must fetch latest ledger + evidence before selecting work. Do not use a stale local copy as authority.

## Worker responsibilities
| Role | Scope | Forbidden |
|---|---|---|
| Scheduled checker | Supabase support replies, non-destructive status checks, report blockers | Claiming Work was restarted, production writes |
| Independent GitHub runner | Allowlisted credential-free checks, CI evidence | Arbitrary commands from issues, production secrets, paid APIs |
| Existing Work session | Integration development and final review when actually resumed | Repeating 63 PASS, concurrent edits to claimed task |
| Human approver | Cost increases, production deployment and destructive operations | Delegating authentication bypass |

## Collision prevention protocol (to implement and test)
1. Claim task using atomic compare-and-swap on the current ledger revision or an equivalent server-side lock. Never assume that a local `in_progress` flag alone prevents races.
2. Each claim has `task_id`, `worker_id`, `run_id`, `lease_until`, `base_commit`, `idempotency_key`.
3. Only the owner may renew/release its claim. Expired leases require an evidence audit before takeover.
4. One writer per shared resource: repository branch, database migration, deployment target. Use GitHub Actions `concurrency` for CI jobs, and atomic ledger writes for cross-system coordination.
5. Before side effects, re-read ledger and check approvals and target environment.
6. Commit result evidence first, then update status to `done`. A failed write must not imply success.
7. On conflict, stop, refresh ledger, reconcile evidence, and retry only safe idempotent operations.
8. Never auto-retry payments, secret rotations, migrations, deployments or production writes.

## Reporting contract
Each run reports: task ID, worker, start/end, last known commit, PASS/FAIL/BLOCKED, evidence URL, side effects, data integrity, costs, next eligible task and required user action. A blank result is not a PASS.

## Activation status
Policy recorded only. Atomic claim mechanism, task queue bridge, CI dispatch, and real multi-worker concurrency tests are **not implemented or validated**. No assertion of collision-free production operation is made.

## Preservation
Existing 33 + 30 PASS are historical and not to be rerun. Do not change production data, GitHub main, live site or bill paid APIs without applicable approval. The user's conditional Pro authorization does not authorize unverified extra charges.
