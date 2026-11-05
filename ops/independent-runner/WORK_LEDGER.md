# SOLQ durable work ledger

This ledger is a **candidate**, not a live autonomous Work scheduler. GitHub is the source of truth for progress. Read this file and `tasks.json` at the start of every authorized execution. Do not infer that a ChatGPT Work session is awake.

## Protocol
1. Acquire a single-writer lock (GitHub Actions concurrency or equivalent); inspect last commit, ledger and evidence.
2. Select only a task whose status is `ready`, dependencies are `done`, and allowed executor has actual permission.
3. Mark `in_progress` with run ID, timestamp and lease expiration before doing work.
4. Perform only approved, allowlisted actions. Keep credentials out of GitHub.
5. Write evidence location, commit SHA, test result, affected resources and rollback notes.
6. Set `done` **only after verifiable PASS**. If not, set `blocked` with reason and next unblock action; do not silently skip.
7. On restart, inspect expired leases and verify whether work completed before retrying. Never blindly rerun an operation that could have side effects.
8. Do not mark an item done based only on a previous report if its required proof differs.

## Current baseline (historical evidence)
- `dc7a7ee`: 33 isolated integration checks PASS.
- `275753b`: 30 additional isolated checks PASS, earlier 33 reused (63 distinct PASS).
- Production DB full encrypted backup, isolated restore and real production admin login: **not verified**.
- Existing data, RLS, main and deployed site must not be modified without applicable approvals.

## Control boundaries
- Human approval for extra charges above USD 25/month, any production deployment and destructive changes.
- Conditional approval for Pro only after official confirmation of backup and isolated restore feasibility.
- The registered Mastercard has **not** been verified here and no charge has been made.
- This ledger does not create a connection from scheduled ChatGPT automations to an existing Work session.
- The first independent runner only does a credential-free smoke test.

## 2026-11-05 recovery checkpoint
- Base `045802e`; recovered eleven historical SQL bodies and missing initial/untracked approval prerequisites under `candidates/command-recovery-20261105/`.
- New scope: 37 isolated PostgreSQL WASM checks PASS, including metadata comparison and synthetic quote/deposit/approval compatibility. The previous 33+30 checks were not run. This is not native PostgreSQL 17 or genuine Supabase Auth/Edge/concurrency PASS.
- Operational counts and content fingerprints remained 9 applications / 6 plans / 7 jobs during the comparison. No production SQL writes, settings changes, deployment or main merge.
- Real backup, protected restore, native platform integration and operational security application remain blocked. SU-536243 is the linked follow-up to SU-533612/SU-526318; the read thread only confirms specialized-team transfer.
- Full report: `ops/independent-runner/reports/ATLAS-20261105-recovery-validation.md`. Overall NO-GO remains in effect. No existing task was falsely marked done and no extra paid runtime was created.

## How a new worker continues
Read `ops/independent-runner/WORK_LEDGER.md` and `ops/independent-runner/tasks.json`. Inspect evidence and the last recorded run; choose the first eligible `ready` task. Respect `blocked` tasks and do not repeat completed checks. Report a concise summary and persist evidence before exit.
