# SOLQ role-based worker operating plan

Status: planning document, not proof that seven live workers are running.

## Shared objective
Develop SOLQ into a safe, profitable AI automation service while evaluating complementary business pillars (online lifelong education, real estate, modular housing, other approved initiatives). The user's one-year KRW 1 billion net profit goal is an aspirational target, not an achieved or guaranteed result.

## Assignment matrix
- COORDINATION: prioritize, assign, review evidence, consolidate reports; this chat is a coordination interface, not a continuously running worker.
- DEVELOPMENT: customer intake, admin UI, website, responsive checks; no main merges or deployment without approval.
- AI_AUTOMATION: free-plan orchestration, Claude integration and cost limits; no paid provider calls without approval.
- SECURITY_QA: authentication, RLS, encrypted backup, isolated restore, independent validation; no production modifications without approval.
- MARKETING: Naver, WordPress, video assets, traffic and lead reporting; avoid duplicate posting and unapproved paid ads.
- FINANCE: revenue/expense ledger, budget and cost alerts, profit measurement; read-only by default, never initiate transfers or unapproved charges.
- BUSINESS: education center, real estate and other business feasibility, legal requirements, business plans; no registrations/contracts without approval.

## Mandatory startup for every worker
1. Fetch latest WORK_LEDGER.md, tasks.json, COORDINATION_POLICY.md and this plan from GitHub.
2. Check final goal, own role, current branch, last verified completion and task dependencies.
3. Inspect existing runs and leases to prevent double execution.
4. Claim only the next eligible task assigned to own role via an **atomic lock mechanism** once implemented. Without that mechanism, coordinate manually and do not claim race-free automation.
5. Execute within permissions; preserve existing 63 PASS, customer records, production DB, main and deployment.
6. Persist evidence, outcome, blockers and next task; mark done only with verified PASS.
7. Send consolidated status to coordination; no invented progress.

## Shared work
Shared work has exactly one primary owner and optional reviewers. A reviewer must not write to the owner's resource. Escalate conflicting changes to coordination. Tasks affecting multiple roles must specify ownership and prerequisites before starting.

## Reporting fields
Role, task ID, status (done/in_progress/blocked/ready), proof URL or commit, effects on production/data, cost, next task, approval required.

## Activation requirements
Role assignments and checklist are design only. Before unattended operation, implement and test atomic task claiming, GitHub Actions dispatch, ledger update conflict handling, permissions and audit trail. Existing ChatGPT Work session cannot be auto-restarted by this document.
