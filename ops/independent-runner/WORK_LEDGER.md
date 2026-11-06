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

## 2026-11-05 native checkpoint
- Tested commit `6c92b6f90f56e9a48a0725b0cc7b6b0f1e37e6b8`: real local Supabase Postgres 17.11 / Auth / JWT / PostgREST / Deno Edge, genuine extensions and eleven unmodified historical SQL files. Final run 51 PASS, 0 FAIL. Prior 37/63 checks not invoked or added to this count.
- Run: https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41964719969 . Eight independent overlapping database connections, real signed-JWT rejection/expiry and synthetic approval workflow verified. Disposable stack cleanup succeeded.
- Restricted RPC owner could not use the managed Auth schema; the native-tested candidate now uses verified PostgREST role claims without widening Auth-schema access. Non-superuser ownership-transfer prerequisites corrected. No operational changes made.
- Counts 9/6/7 and content fingerprints unchanged; operating Advisor WARN 7 remains. Whole encrypted operating backup, protected actual restore, default-ACL/provider review, native rollback and final PC/mobile gates are not complete. Overall NO-GO.
- Details and all seven attempt records: `ops/independent-runner/reports/ATLAS-20261105-native-platform.md`, `ops/independent-runner/reports/native-20261105/`. The public CI environment is synthetic-only and must not receive actual customer backups.

## 2026-11-06 ATLAS read-only orchestration checkpoint (09:42 KST)
- Executor **ATLAS** directly read ORCHESTRATION_PROTOCOL.md, orchestration-queue.json, tasks.json, WORK_LEDGER.md, O1/O2 directive, native-platform evidence, and the v29 admin closure report. This is document inspection, **not worker dispatch or execution**.
- Admin auto-generation fix remains **CLOSED** at `e4616c4`; Sites v29 was reported deployed and post-deploy fingerprints verified. Do not reopen or repeat its tests. Native nonproduction 51 PASS / 0 FAIL evidence reused, not rerun.
- Queue remains candidate_not_activated; GUARD/CORE/AUTO/SENTINEL/FIN **PENDING / NOT_DISPATCHED**, no verified ACK, ACCEPTED, IN_PROGRESS or DONE. No active independent worker runtime established.
- Gate-1 WAITING_OWNER: actual Owner Database → Backups screen recovery point/type/status/download options not observed here; O1-A/B not PASS. Gate-2 BLOCKED: no full encrypted backup. Gate-3 BLOCKED: no verified protected isolated target/actual restore. Gate-4 BLOCKED: RPO/RTO not measured. Gate-5 BLOCKED: seven Advisor warnings remain unresolved per prior evidence. Gate-6 BLOCKED: complete PC/Android/iOS regression and live service rollback untested; v29 Android owner-view evidence does not cover all devices. Gate-7 BLOCKED: no complete approval package or separate O3 GO.
- Owner's single next action: open existing Supabase Owner project's **Database → Backups** read-only and report only latest recovery-point timestamp/timezone, backup type, status, and whether download is offered; do not click Restore/Clone/Reset/Upgrade or disclose secrets. Planned Owner UI effort 5–10 min and interpretation 10–20 min after receipt (both unmeasured); backup/restore ETA unknown until size, protected environment, egress and access are established.
- Approval authority: Owner for access/cost and O3; provider support for provider-specific restore capabilities. Additional paid resources authorization **0 KRW** in this run. Alternative: Owner manually relays sanitized UI details or official provider support; no public CI customer data. Next gate O1-A then O1-B/B1/O2-A/O2-B.
- This checkpoint modified only this GitHub ledger on the development branch; no operating DB/settings, main, deployment, billing, customer data, existing automations, or worker queue states were changed. Overall **NO-GO** for remaining platform-wide gates.

## 2026-11-06 ATLAS integrated execution audit (11:07–11:09 KST)

**executor: ATLAS.** Direct authorized read-only inspection and development-branch evidence recording only. Admin auto-generation fix remains **CLOSED** at e4616c4, operating Sites29 remains active. No independent worker was dispatched.

### Scheduled execution versus completed evidence
- The requested 10:23 KST one-time job has a recorded actual start **2026-11-06 10:27:51.229568 KST** and end **10:31:55.560504 KST**. Runtime recorded `no_update`, latest_result=null, delivery_status=unknown. This confirms an execution attempt completed, not that all work or delivery succeeded.
- Conversation tool evidence from that execution shows read-only SQL at10:29, current Advisor, public homepage/intake DOM and admin login screen, existing report/task reads, official backup docs, Pro-plan metadata, and saved v28 metadata. These actions were performed by the current Work assistant, recorded here as **ATLAS**, not CORE/AUTO/GUARD/SENTINEL/FIN.
- Before this update, WORK_LEDGER.md was still the09:42 checkpoint (blob56c224558276cde630842b69b42776e593a5f269). No10:23 execution result commit or published result body was found. Therefore the scheduled job is **execution verified / outcome partially evidenced / GitHub persistence not completed**, not SCHEDULED_ONLY and not full DONE.
- This follow-up began at **11:07:26 KST**, retrieved actual run history and all four protocol/queue/ledger/task files, reused10:29 evidence, then performed the limited fresh observations below. Investigation ended11:08:52 KST; record persistence is evidenced by the commit containing this section and successful remote readback. Do not attribute this new commit to the10:23 job.
- Current ATLAS read-only audit status: **DONE when this ledger write and readback succeed**. Dependent operational tasks remain blocked as below. No new automation created; existing jobs not changed.

### Dispatch, task and evidence reality
|Actor/task|Delivery/receipt/execution state|Evidence|
|---|---|---|
|ATLAS direct audit|Actual direct reads performed; recording is this update|Runtime records and tool timestamps below|
|CORE, AUTO, GUARD, SENTINEL, FIN independent workers|PENDING / NOT_DISPATCHED|queue mode=candidate_not_activated, ACK/accepted/run_id/lease fields null|
|GROW, INNO, EDU, ESTATE, MODU, CARE|Not dispatched for this work|No new execution, contract, filing or charge|
tasks.json and queue state are left unchanged; their historical platform-wide dependencies do not reopen the separately CLOSED admin fix. No fabricated ACK/ACCEPTED/IN_PROGRESS/DONE and no 30-minute dispatch SLA claim.

Reused native source6c92b6f90f56e9a48a0725b0cc7b6b0f1e37e6b8, 51 PASS/0 FAIL and report ATLAS-20261105-native-platform.md, run https://github.com/holykjh1425-stack/jubilant-computing-machine/actions/runs/41964719969 . No tests rerun. Also reused admin0a091a3/83cab9b/14ffd25/e4616c4 and scope review3ca8b78.

### Current operating evidence
- Sites get_site: https://solqtech.com, active, latest_version_number29, current_user_role owner. No deployment.
- Public browser at10:29–10:30: actual homepage and application form with both required consent controls visible. No form submitted. Existing browser tabs were empty; opening /admin.html redirected to https://solqtech.com/admin and showed a login form. No reusable authenticated Work session. Existing owner mobile admin proof remains valid for its recorded scope; this is not a new authenticated UI PASS.
- DB SELECT at **11:08:15.916535 KST**:

|Table|Total|Original set excluding the approved synthetic receipt and its linked rows|Original full-row fingerprint|Match|
|---|---:|---:|---|---|
|applications|10|9|ab4edc5be0aea000e9b53979a2e796d5|yes|
|ai_work_plans|7|6|dcc75548a915b45585f9543f80574805|yes|
|orchestrator_jobs|8|7|8ad9bbd159b842397b1c8966fb368c3a|yes|
|production_jobs|7|6|d0afc319aa608eb8fd61d19e7e9a5975|yes|

Method is the previously used md5(string_agg(md5(to_jsonb(x)::text),'' order by id)); NULL application_id legacy rows included. Baselinee4616c4 and10:29:14.371406 observation agree. IDs, content and embedded relationship keys of the original records are unchanged. No new applications since the09:15 closure. Counts did not grow; no normal new customer intake or new unintended generation observed. No claim about unobserved activity or indefinite guarantee.
- At **11:08:14.299535 KST**, nexus-free-orchestrator and nexus-production-capture active=true, each last-hour success60/fail0; latest successes11:08:00.029772 and11:08:00.031099 KST.
- Site Worker error log query at10:30 for prior60min returned events=[]. Supabase unified logs09:30–10:30 requested window (observation before end) exposed postgres260/pgbouncer3 events; status_code>=500 and explicit level error/fatal/panic counts0. Other API/Auth/function streams were absent in this result; no global error-free guarantee. No retry loop or raw customer log export.
- production_attempts0 at11:08; at10:29 provider rows openai/codex disabled, approved/reserved calls0 and approved/reserved budgets0. No paid provider invocation made by ATLAS. External provider billing/account-wide calls cannot be independently certified from these internal counters.

### Separate production-record inspection: partial DB evidence, UI NOT_VERIFIED
At **11:08:51.270524 KST**, production records7: all7 have applications,6 have saved plans,3 have matching application/plan/orchestrator links. Status awaiting_deposit6/cancelled1, attempts0.
At10:30 prior grouped SELECT: cancelled1 lacks saved plan; all6 awaiting_deposit have plans, but3 lack an orchestration row by application_id or linked plan ID. This is preserved existing structure, not proof every workflow association is complete.
orchestrator_jobs.application_id IS NULL count5; non-null application_id duplicate groups0. Prior wording “unlinked4” used an unspecified definition; this explicit SQL metric must not be presented as a newly created orphan incident. Original whole-row fingerprints match. At10:30 dangling non-null plan/application/job/free_plan/production foreign references0 and duplicate non-null idempotency-key groups0. Existing logical-duplicate historical records are not cleaned up.
Actual production management UI/real JWT query remains **NOT_VERIFIED** because no existing authenticated Work session; database connector aggregate SELECT is not equivalent to actual UI/Auth verification. No alternate login/token copying, status save, quote acceptance, deposit confirmation or production approval performed. Minimum unblock: an existing owner-authenticated production management view provides read-only evidence; no new credentials requested in chat.

### Security assessment: seven WARN remain open
Current Advisor **11:08:16.465 KST**: anon executable SECURITY DEFINER3 + authenticated executable same3 + leaked-password protection disabled1. No new warning category relative to10:29.
|Warnings|Risk assessment and category|Evidence/next action|
|---|---|---|
|submit_application, anon/authenticated2|Medium residual public-write abuse; planned review|Prior function review: input/consent bounds, fixed received/null internal_note, empty search_path. Public intake is intentional. Review minimum privileges/rate controls without breaking intake.|
|submit_support_inquiry, anon/authenticated2|Medium residual public-write abuse; planned review|Prior review: both consents, length/token bounds, token hash, empty search_path. Preserve public function while reviewing restricted ownership and throttling.|
|read_support_inquiry, anon/authenticated2|Medium capability leakage risk; planned review, low direct relation to changed admin files|Prior review: ID+hashed capability check and static SQL. Missing/wrong token rejection already tested independently; not rerun here. Review token handling/minimum grants.|
|Leaked-password protection OFF1|Medium account-compromise risk; planned settings review|Provider feature remains OFF. Owner-approved change and login regression required; no toggle performed.|

No immediate exploit/auth bypass/key exposure/approval bypass was established by the available evidence; absence of a new finding is not a penetration-test PASS. All7 remain unresolved, and no explicit risk acceptance is recorded. Broad API-key hygiene/security review uses prior publishable-only candidate and RLS/admin-membership evidence; actual secret values not read. Plan a security review by2026-11-13 (proposed deadline, not a new scheduled task). Permission revocation or enabling password protection requires separate operating approval.
Official remediation:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

### Backup and rollback readiness (reused10:30 findings)
NEXUS LABS subscription confirmed Pro by get_organization; official docs refreshed at10:30:
https://supabase.com/docs/guides/platform/backups
https://supabase.com/docs/guides/platform/clone-project
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
Pro provides7-day daily backup access, but this project's actual backup point/time/type/status/download option has not been observed through an Owner Backups view. The available connector has no backup-list operation; no PAT/token creation or credential extraction to bypass this limitation.

|Scope|Current evidence/availability|Missing|
|---|---|---|
|DB data/schema/functions/triggers/RLS/roles/ACL|Partial; existing recovery SQL/catalog and platform51 evidence|Actual consistent encrypted complete dump and actual restore|
|Auth data|Part of DB recovery scope, not actually secured as a full artifact|Protected export/compatibility restore; custom-role passwords not in daily backups|
|Auth settings/SMTP/OAuth|Not secured|Protected settings/credential recovery procedure|
|Storage|10:30 buckets0/objects0, DB metadata only|Recheck at backup time; files are not included by DB backups|
|Edge source/deployment config|Partial prior source/version records|Verified protected deployed-code/settings package|
|Vault/Secrets|Not secured; no plaintext values read|Official protected root-key/secret recovery path; logical ciphertext dump alone insufficient|
|Actual backup/restore/RPO/RTO|None completed|Storage/auth/isolation and successful measured recovery|

Existing Windows TLS verify-full dump→GPG public-key streaming encryption→existing protected local restore remains the preferred no-new-infrastructure candidate. PC ACL/free-space/non-sync path, public-key recipient, existing DB credential and CA/host validation, recovery-key custodian and isolated PG17/Auth-compatible target are unverified here. No actual dump/restore or USB private-key access.
Provider clone would create an extra billed project and can copy active cron/net extensions; do not use as a free/no-egress workaround. Existing-project restore causes downtime and is prohibited. Additional recurring cost/size/egress cannot be quoted without actual resource selection; current new-spend authorization0. Do not enable paid PITR.
After approved access: verify protected destination and isolation/egress blocks before exporting; encrypt without plaintext temp files, record SHA256/size/times/exit codes, restore only to distinct protected target, compare data content/schema/roles/ACL/RLS/sequences/Auth/function smoke, measure actual RPO/RTO, revoke temporary access. No customer data in public CI or GitHub.

Sites get_site_version at10:29 confirmed savedv28, sourceab4d34c830669e69b57f0689588eb6a24b41f91e, archive SHA256ced870445c10f9458a154afaad5cf4346eb3e8e95ba308dd1cbe3fb20ae75b18,481280bytes/34entries.
Rollback target version_id: appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_0a79ac6b93608191a3694797fef0718c.
Prepared procedure, **NOT executed**: obtain separate Owner rollback authorization, use native deploy_site_version with that saved ID, inspect deployment result/current URL, owner checks admin login/list/plan and unchanged intake, compare data fingerprints and cron history. It can restore the removed UI auto-generation defect, so rollback tradeoff requires Owner review and minimal read-only validation. No data deletion rollback; do not stop cron. Expected service interruption/runtime is unmeasured and cannot be promised; saved-version/archive/file round-trip is not actual service rollback PASS.

### Gate-1–7 and full unblock records
|Gate/state|Cause|Authority|required action / unblock condition|Cost and free alternative|ETA and basis|Next|
|---|---|---|---|---|---|---|
|1 WAITING_OWNER|Actual recovery points and protected execution access unobserved|Owner|Read Database→Backups list: latest timestamp/timezone,type,status,download offered; protected destination confirmed|Existing Pro read only, no purchase; sanitized Owner relay or official support alternative|Owner UI5–10min planned/unmeasured; access-dependent|2|
|2 BLOCKED|No full encrypted artifact/SHA256|Owner + backup custodian|Approved existing DB access/TLS, private destination ACL/key recipient, safe consistent streaming dump succeeds|Existing PC/tools first; egress/storage overage unknown, stop if costs needed|Cannot estimate without DB size, access and throughput|3|
|3 BLOCKED|No secured full backup/verified private restore target|Owner + target custodian|Existing isolated target with outbound automation blocked; protected restore and integrity comparison PASS|Existing local target; paid clone requires explicit new quote/approval and not created|Unknown until backup size/target compatibility/throughput known|4|
|4 BLOCKED|No real restore timing|GUARD role/Owner, actual executor must be evidenced|Measure backup consistent point and restore-to-service completion|No incremental resource planned; do not substitute provider retention for RPO|Unknown before actual restore|5 / parallel security review|
|5 BLOCKED|7WARN and global residual risk not closed|Owner + security approver|Per-warning fix verification or explicit justified risk acceptance; no policy changes under this run|Static review free; feature/plan costs must be checked before change|Static review1–2h planning only; implementation/approval ETA unknown|6|
|6 BLOCKED|Complete PC/Android/iOS regression and live rollback untested|Owner + device/hosting custodian|Existing actual-device regression and approved protected rollback test evidence|Existing devices/private assets; no paid device service/server|Unknown without device access; no measured rollback time|7|
|7 BLOCKED|Prior gates incomplete and no new platform-wide O3|Owner|Exact change list, evidence and rollback package after1–6, then separate explicit O3|Approval itself no fee; no deployment under this instruction|Dependent on gates; no reliable aggregate ETA|Separate approval then scoped implementation|

Owner's **single next step**: read the existing project's Database→Backups listing and provide only recovery-point time/timezone, type, status and whether download is offered. No Restore/Clone/Reset/Upgrade, passwords or keys.

### Completion and preservation
This audit directly completed allowed reads and evidence reconciliation; separate workers remain NOT_DISPATCHED. Existing tasks/queue and unrelated business workers/automations untouched. No51/9 tests rerun, no new synthetic application, actual backup/restore0, operating data/schema/Auth/RLS/SSL/Vault/Edge/provider settings0 changes, main merge/deployment/rollback0, paid API0, new paid resources0, customer messages/support duplicate inquiries0. Additional payments incurred by this execution0; account invoices/overall usage not accessed, so total organization billing is NOT_VERIFIED.
**Final platform-wide deployment decision: NO-GO. Existing v29 service stays active; separately CLOSED admin fix is not reopened.**

## 2026-11-06 backup recovery unblock checkpoint — executor ATLAS

**Scope:** Actual access and tool-path diagnostics, support response reconciliation, existing script static review, and evidence/status updates. Existing admin fix CLOSED/e4616c4 and operating v29 unchanged; global deployment NO-GO. Existing51PASS not run. Workers remain PENDING/NOT_DISPATCHED: this is direct ATLAS work.

### What actually changed in the blocker evidence
1. **Owner access diagnosed, not guessed:** existing browser inventory had0tabs. One authorized direct visit to official /dashboard/project/elfacqmvygnwjlklqhiz/database/backups/scheduled redirected to /dashboard/sign-in with returnTo pointing back to that page. Existing authenticated Owner session unavailable. This is an authentication-session blocker, not evidence of insufficient project permissions, disabled backups or a missing Pro entitlement. No login submission or password reset.
2. **Substantive official answer found:** SU-536243 security-team reply timestamp **2026-11-05 16:16:25 UTC / 2026-11-06 01:16:25 KST**. Earlier SU-533612/SU-526318 were merged. Mail thread was read; a fresh scoped related-ticket search found this technical reply. No duplicate message sent. Prior “await substantive reply” reason is now superseded, not repeated.
3. **Actual current execution prerequisites checked:** Linux Work PATH has GPG and Node; pg_dump/pg_dumpall/pg_restore/psql/Docker/SupabaseCLI absent from PATH, /usr/lib/postgresql absent, /var/run/docker.sock absent. This does not prove every disk location lacks a binary. It proves no presently usable standard tool chain/socket was identified. No installation or new server/project.
4. **User PC distinction:** previous Windows PG17.11/Gpg4win/public-key PASS evidence reused. Current Linux runtime cannot access C:\SOLQ_보안백업 or the user's Windows Docker/key store. This is NOT a claim those PC folders/tools were deleted or missing. No USB or private-key access.
5. **Existing code recovered and reviewed:** ops/windows-backup/Backup-Encrypted.ps1 local Git blob equals remote blob d95cfe456ec2ac2b8d263526b6d8f8a182ec9ab6 on this development branch. Static review of it and EncryptedStream.cs confirms default preparation-only stop, explicit operating/security switches, Windows-only execution, PG17.11 requirement, Direct/Session-specific host/user checks, TLSverify-full with CA, readonlyPGOPTIONS, dedicated public-only key home, raw binary pipe to GPG, ciphertext-only hash, non-overwrite/partial-output failure stop. No executable ran against Windows or operating DB.
   - Backup-Encrypted.ps1 SHA256 7b2e818935fae83fe95a08f29c6b47fdb0a840a95fa0638651197b6c37f534ce.
   - Check-BackupTools.ps1 local artifact SHA256 672e34db3a3b8e812379ead0e27cef652c3cec7d2198643a4a2092ae76b04d96.
   - EncryptedStream.cs local artifact SHA256 922f72c3793a254ff931ba91e7cac7f64a7a85c824697af50f2cef803b15c1f1.
   - These existing files were not rewritten. Previous11WindowsPASS was not rerun. ACL/synchronization/recipient/source-CA provenance rely on an operator checklist; switches alone are not proof. Database and role dumps are separate snapshots; completeness/role-change consistency still require verification. Script output expressly says DB_AND_ROLES_ONLY, not full recovery PASS.
6. **New source metadata only:** SQL SELECT observed **11:57:53.237571KST**: PostgreSQL17.11, DB physical size21,051,059bytes,15non-system schemas, Storage buckets0/objects0, cron extension available. Physical size is not compressed dump size or an RTO estimate. No customer rows/Auth hashes/Vault plaintext/cron command bodies queried.

### Official answer and safe-path decision
Support confirms:
- Existing Pro daily backups retain7days, DB only. Storage files and custom-role passwords are excluded.
- Restore to a New Project does not require the existing DB password; it copies DB schema/data/roles/permissions, Auth users and Vault encryption key. This verifies an official passwordless *provider restore* path, not a downloaded encrypted backup artifact.
- Storage files/settings, Edge Functions, Auth settings/API keys, Realtime/extension settings and read replicas need separate configuration.
- New restore project adds billing based on mirrored resources. **pg_cron and pg_net begin running as soon as restore completes, with no supported pre-pause.** Post-restore disabling is too late to prove zero external actions. Cost approval alone would not cure this isolation blocker.
- CLI logical backup needs the existing DB password. Support suggests reset if it is unavailable; resetting remains prohibited. Owner dashboard login and connector SQL authority are not interchangeable with a pg_dump password.
- Pro leaked-password protection is available; security grants can affect public functions and must be tested before changes. No setting/grant was changed.

No Pro conversion is required by a manually operated logical dump; Free-tier-compatible pg_dump/CLI export still needs valid DB credentials and appropriate permissions. Already-Pro subscription is not changed. No supported passwordless, no-cost, pre-egress-blocked full recovery route is established under the current combined constraints.

Official references reused:
https://supabase.com/docs/guides/platform/backups
https://supabase.com/docs/guides/platform/clone-project
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
The human reply provides the stronger project-support statement about Vault-key copying and no pre-pause. No raw email headers, addresses or support signature are copied into this public repository.

### O1–O4 status / scope and missing conditions
|Task/status|Real evidence and blocker|Approval authority / exact action|Cost / free alternative|Unblock condition / ETA / next Gate|
|---|---|---|---|---|
|O1 WAITING_OWNER|Authentication redirect verified; backup list/time/type/status/retention/download not actually viewed|Existing Supabase Owner: login using normal existing method; NEXUS LABS→project→Database→Backups; inspect list only|Read access in existingPro, no new charge. Alternative: sanitized Owner relay or existing support route|Actual latest recovery metadata and destination access identified; Owner view5–10min planned, unmeasured; nextGate1→2|
|O2 BLOCKED|No operating artifact. Current pg_dump chain, approved Windows destination access and valid dump credential absent|Owner/backup custodian confirms existing credential through protected local input, CA, recipient, destination ACL/space/non-sync and retention|Existing PC tools/free logical dump preferred. Egress/volume limits unverified; no new spend authorized|All protected local prerequisites plus scope/snapshot verification; duration unknown until actual connection/throughput; nextGate2|
|O3 BLOCKED|No currently accessible existing isolated PG17/Supabase-compatible target. New provider clone violates no-new-cost/no-pre-egress-run conditions|Owner + target custodian confirms existing target's distinct addresses/accounts/volumes and outbound/cron/SMTP/webhook blocks before sensitive restore|Existing local target first. No clone/PITR purchased; exact additional hosted cost not quoted because no resource approval|Target access/isolation/auth/storage and protected key handling verified; ETAunknown without environment access; nextGate3|
|O4 BLOCKED|O2/O3 incomplete; no encrypted backup or real restore to validate|Owner confirms specific protected backup/restore scope; GUARD independently verifies actual evidence|No cost in this run; no unapproved server/restore|Only after actualartifact/isolation/approval; RPO/RTO then measured, not estimated; nextGate3→4|

### Backup coverage and restoration acceptance
- DBdata/schema/functions/triggers/indexes/sequences/RLS/owners/grants/defaultACL: target full logical recovery scope; currently only structure/candidate evidence, no full artifact. Managed internal schemas/extension object handling and permission errors cannot be silently skipped.
- Auth rows: must be within protected DB recovery scope and verified against compatible Auth version, never exported to public CI. Auth settings and custom-role password recovery separate.
- Storage metadata: DB scope; actual files separate encrypted copy. Current0object observation is not an all-time guarantee or proof future backups include files.
- Edge deployed code/config and application version: separate protected matching-source package. Secrets/API keys/OAuth/SMTP and Vault recovery require approved protected recovery mechanism; ciphertext alone is not a Vault restoration proof.
- Before actual export: approve exact destination/ACL/recipient/custodian/retention and local secure input, verifyTLSfullhost, use bounded readonlydump + raw binary encryption, stop on any failure/warning or unknown cost, label partial files incomplete. Record ciphertext hash/bytes/times/exit codes, not secrets.
- Before restore: distinct operating/restore address+account+storage, external egress denied, cron/net/SMTP/webhooks/provider execution disabled by isolated target configuration **before** import. Copying production into public GitHub Actions is not allowed.
- Acceptance: decrypt via custodian-managed private key without key extraction, restore data/schema/roles/ACL/RLS/sequences/Auth, compare full-row fingerprints and dependencies, synthetic feature smoke only after isolation. Measure RPO from backup consistent point to assumed disruption time; RTO from restore start to required-service validation complete. Current RPO/RTO NOT_MEASURED.
- No generated backup file, SHA256-of-backup, successful restore or complete recovery PASS is claimed.

### Gates and closeout
Gate1 WAITING_OWNER; Gate2/3/4 BLOCKED on actualartifact/target/timing; Gate5 BLOCKED on unresolved security/explicit risk decisions; Gate6 BLOCKED on complete actual-device/live-rollback validation; Gate7 BLOCKED on prerequisites and separate platform-wide Owner GO. Admin4-file fix stays independently CLOSED andv29 active.
The technical reply and actual authentication/tool blockers are now verified; operational backup access, secure output and restore capability are NOT unblocked.
Owner's single next action: **open the existing Owner project's Database→Backups list and provide only latest timestamp/timezone, backup type/status, and download availability.** No Restore/Clone/Reset/Upgrade or credentials in chat.
Actual backup0/restore0, private-key access0, DBpassword/SSL/Auth/RLS/rolechange0, customer changes0, new synthetic requests0, paidAPI0, new paid infrastructure0, main/deployment0. Independent workers remain NOT_DISPATCHED. Additional charges initiated0; organization-wide invoice totals not inspected.
This commit updates only WORK_LEDGER.md, orchestration-queue.json and tasks.json on the development branch. Operational state is untouched. Final **NO-GO**.


## 2026-11-06 12:21 KST — physical-backup restore checkpoint (executor: ATLAS)

Supersedes the prior Gate-1 WAITING_OWNER conclusion only. Existing v29/admin CLOSED and 51 PASS are preserved; no test rerun. Independent workers remain NOT_DISPATCHED.

### New Owner evidence and read-only execution
- Owner's current directive directly confirms Database > Backups list access, several PHYSICAL points and Restore buttons. Latest at that observation: 2026-11-05 18:13:51 UTC = 2026-11-06 03:13:51 KST. Download not confirmed; UI says Storage files excluded. **Gate-1 PASS (list access only)**. Not proof of backup job status, downloadable encrypted artifact, integrity or restored operation.
- Work performed one read-only restore-to-new-project route inspection. Final observed URL was the official sign-in with the intended route in returnTo; title Sign in | Supabase Dashboard. No credential entry, additional login, Restore, Clone or upgrade. Work auth limit does not invalidate Owner evidence.
- Read-only project API: active/healthy; PostgreSQL17.11.0.003, ap-southeast-2. API does not establish current mirrored compute/disk quote.
- Organization cost tool returned type project, recurrence monthly, amount10. Currency/configuration and restore-specific mirroring absent. This is **not an exact restore quote or cost approval**.
- Official compute docs reconfirm Micro USD0.01344/hour (~USD10/month), running-hour billing rounded up, shared organization compute credits, compute excluded from Spend Cap. Source compute/disk, remaining credits and applicable storage/egress not verified. No project/cost confirmation created.
  Reference: https://supabase.com/docs/guides/platform/manage-your-usage/compute

### Official support answer reused, not re-requested
SU-536243 substantive reply received 2026-11-06 01:16:25 KST: provider new-project physical restore needs no existing DB password and copies DB/Auth rows/roles/permissions and Vault encryption key. Separate project leaves source production unchanged. Storage files/settings, Edge, Auth configuration/API keys and other external settings are separate recovery work. **pg_cron/pg_net start immediately after restoration and cannot be paused beforehand through the supported path.** Post-start disabling is insufficient for this directive's prerequisite. No duplicate support message sent.
References: https://supabase.com/docs/guides/platform/clone-project ; https://supabase.com/docs/guides/platform/backups

|Method|Authentication/cost|Decision and exact blocker|
|---|---|---|
|Existing project Restore|Owner authority; overwrites operating state|FORBIDDEN; not clicked|
|New project physical restore|No DB password; additionally billed mirrored resources, exact quote unavailable|BLOCKED: automatic cron/net execution has no supported pre-pause; no proven pre-start egress block. Paying alone cannot cure this|
|Logical dump to existing protected local target|Existing DB credential, PG client, verified TLS, protected encrypted destination and target approval|Conditional preferred alternative; no new server purchase needed in principle. Current Work lacks target access/DB credential. Does not consume the existing physical artifact and does not alone recover Vault key/external settings|
|Existing protected environment reuse|Existing target custodian and local secure input|BLOCKED: no accessible approved customer-data restore target; prior disposable CI is not approved for customer data|

No safe executable physical-restore route is established under all current constraints. Do not infer outbound isolation from inbound network restrictions. No operating DB reset/password/SSL/Auth/RLS change is authorized or performed.

### Coverage and safety acceptance
DB data/schema/functions/triggers/indexes/sequences/RLS/grants/defaultACL/Auth rows are provider DB scope, but no export or restoration was executed. Custom-role passwords and external configuration require separate protected recovery. Storage actual files are excluded (prior bucket/object0 observation reused, not re-counted here). Edge source/deploy settings, Vault/Secrets and OAuth/SMTP are separate; logical ciphertext export is not proof of decryptable Vault recovery.
Existing encrypted Windows script/source review and checksum evidence from previous checkpoint reused; not rewritten/run. Need verified non-public destination ACL/non-sync/space, recipient and recovery-key custodian, independent target network/accounts/volumes and **pre-import** cron/net/SMTP/webhook/external API block. No customer data may enter public CI.
RPO/RTO NOT_MEASURED. No restore logs, backup ciphertext/hash/size or content-integrity comparison exists for this execution. Owner backup timestamp alone is not an RPO measurement.

### Blocker record and next action
- Authority: Owner plus protected Windows target/backup custodian.
- One next Owner action: connect the existing protected Windows PC execution session so existing backup tools, private destination and local restore target can be inspected without running backup/restore or sharing credentials. This advances access verification only; missing DB credentials remain a separate prerequisite, and password reset remains prohibited.
- If credentials cannot be securely supplied through an existing approved local mechanism, logical export remains blocked. If no pre-start isolated provider path is available, physical clone remains blocked even after cost approval.
- Exact additional hosted quote NOT_VERIFIED; new charge initiated0. Existing subscription total/invoice not audited.
- ETA cannot be grounded without target access, credentials, isolation and measured throughput. Next Gate2/3; no automatic retry.

Gate1 PASS (Owner listing); Gate2 BLOCKED (actual full encrypted recovery artifact); Gate3 BLOCKED (actual approved safe restore); Gate4 BLOCKED (RPO/RTO); Gate5 BLOCKED (security closure); Gate6 BLOCKED (actual-device and service rollback completion); Gate7 BLOCKED (mandatory gates and separate final approval).
Actual backup/export0; restore0; customer writes0; secret extraction0; paid AI0; new projects0; operating changes0; main merge/deployment0. Only these three development-branch records updated atomically. Final **NO-GO**.
