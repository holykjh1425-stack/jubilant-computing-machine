# SOLQ independent runner — isolated candidate

Status: **prepared only; not deployed or scheduled**. This branch is separate from `main`.

## Goal
Persist approved work requests in GitHub, execute only allowlisted non-production checks through GitHub Actions, and record immutable run evidence. This does **not** wake or authenticate an existing ChatGPT Work session.

## Safety boundaries
- No production Supabase credentials, passwords, API keys or customer records in job inputs, logs or artifacts.
- No production DB writes, schema changes, payments, external API charges, deployments or main merges.
- Never infer that 33 + 30 prior checks passed again; reuse evidence from `dc7a7ee` and `275753b`.
- Existing applications 9, plans 6, jobs 7 are prior observations, not live assertions.
- Run only explicit allowlisted tasks; no shell commands supplied by an issue or arbitrary user text.
- A GitHub Actions workflow needs separate activation and execution verification; a file on this candidate branch is not an active scheduler.
- Production backup and isolated restore remain blocked pending official access and coverage guidance.
- Do not copy real secrets into GitHub Issues.

## Proposed handoff
1. ChatGPT scheduled checker reviews support responses.
2. A permitted connector records a structured request with idempotency key in the designated branch or GitHub Issue. This bridge is **not implemented**.
3. GitHub Actions validates schema and safety restrictions, executes an allowlisted check, uploads non-sensitive evidence. This branch provides a smoke-test candidate only.
4. Work can inspect GitHub run logs after a user resumes it; direct Work auto-restart is **not supported by this design**.

## Activation gates
- Review permissions and audit trail.
- Confirm GitHub Actions availability and repository workflow policies.
- Validate one manual dispatch on this branch without credentials.
- Separately approve schedule or issue-driven triggers and any required write permissions.
- Keep production deployment separately approved.
