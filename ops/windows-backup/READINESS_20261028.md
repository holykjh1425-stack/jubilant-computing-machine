# SOLQ encrypted whole-backup execution readiness — 2026-10-28 KST

Preparation only. NO operating dump, export, restore, user-key operation, login, installation or deployment authorized/executed here. Previous product/Auth/native-concurrency PASS evidence is reused.

## Accepted user-confirmed preparation (not remotely inspected)

- Windows destination: C:\SOLQ_보안백업 created.
- Gpg4win5.1.1 installed, SOLQ Secure Backup OpenPGP key created in Kleopatra.
- Secret-key backup stored under the existing Klevv USB D:\SOLQ_복구키_보관; USB safely removed.
- USB secret-key backup readability/recovery is UNVERIFIED and was not accessed, imported, copied or transmitted.

Exporting a secret-key backup does not remove the original key from the PC. Whether the original still exists is unverified; do not delete or change it. Public-key encryption can use a dedicated key home containing only the VERIFIED public recipient, without accessing the USB or original private key. Real recipient fingerprint/expiry/encryption capability remain to be checked on the PC using public metadata only; a key label or short key ID alone is insufficient.

## Actual read-only operating observations

Current server: PostgreSQL17.11. Applications9, plans6, orchestrator_jobs7, storage_objects0, registered administrator1 (last preparation). The latest application/plan/job content fingerprints match the previous verified baseline:

- applications e881cecf41e029c88c7c4a644cdc357f
- plans e7642d2d1b7fd3667bede1a79f78568e
- jobs cdf5a01b412ee35d7e718389c9c1d25e

No duplicate/unlinked row was changed. MCP SQL access works as postgres; this does NOT supply a pg_dump connection password or prove dump privileges on every managed object. Automatic free-tier backups remain user-confirmed unsupported; no repetitive dashboard/login investigation.

Edge metadata: nexus-ai v4, nexus-orchestrator v7, nexus-agent-worker v2, nexus-production v1. No function invoked or redeployed. Source/config exports are deferred with the operating backup, not silently performed during this preparation.

Vault0.3.1 registers vault.secrets as an extension configuration table. pg_cron1.6.4 registers cron.job and its sequence/history tables; pg_net0.20.4 has no extconfig entries. These are catalog names only, not secret values/cron command bodies. Vault decrypted views/API secrets were not read. Extension registration is a coverage clue, not a proof that all extension/transient state is recoverable by a default dump.

## Environment / blockers

| Item | State |
|---|---|
| Work pg_dump / pg_dumpall / pg_restore | Not in current PATH |
| User Windows PostgreSQL tools | Unknown; no direct PC access; do not infer from screenshots or installed Gpg4win |
| Work gpg | GNU GnuPG2.4.4; not evidence of Windows5.1.1 behavior |
| User recipient public key fingerprint | Not supplied/verified |
| Official DB connection and protected credential entry | Not prepared in this environment |
| Approved operating-data restore target | Not available/verified |
| USB private-key recovery | Unverified; no USB access |

Check-BackupTools.ps1 is a read-only Windows preflight. It checks PATH and standard PostgreSQL17/GnuPG locations plus the destination's existence/reparse attribute. It makes no DB connection, reads no key, writes no file, installs nothing and changes no execution/security policy. It has a UTF8 BOM for Windows PowerShell5.1. CI parses syntax only; actual Windows tool execution/installation status is still unknown. If Windows blocks the script, stop; do not weaken ExecutionPolicy or other protections to run it. Tools-only installation requires separate user approval, using the official PostgreSQL/EDB Windows installer and selecting Command Line Tools only; no database server/pgAdmin/Stack Builder is needed for export.

## Synthetic encryption verification and limits

The scoped test uses only generated noncustomer bytes, a new disposable SYNTHETIC RSA2048 key inside tmpfs, and separate public-only encryption/private decryption homes. No user's key/USB/PC/operating data or DB URL is accepted. Public key alone is exported/imported for the synthetic test; no secret key is exported. Temporary synthetic keys are removed after killing their agents.

Work execution failed before key generation because its restricted environment could not start gpg-agent. First CI attempt stopped before key generation on visible swap. Neither failed environment is PASS. The existing disposable CI runner was hardened with swapoff; it is not the user's PC, and no user-PC setting was changed. Follow-up CI tests cover public-only encryption, binary stdin round-trip and SHA256 equality, corrupted ciphertext rejection, missing recipient failure, and a producer that exits17 while gpg encrypts partial input successfully. That last case must never be promoted to a complete backup. Final synthetic verification: 6 PASS, GitHub run40590192936/job122492119412, tested commit e96924a, 2026-10-28 06:51 KST. Windows preflight syntax parsing also passed; no Windows PC was accessed. Full result and run/job provenance are stored in tests/backup-crypto/results.json.

This is synthetic GnuPG validation, not a Windows5.1.1/user-key test, not USB recovery, not a database restore, and not validation of a production Windows backup coordinator. tmpfs plus no visible guest swap does not prove absence of hypervisor paging. No real customer data belongs in public CI. Synthetic tests do not authorize copying real data/keys there.

## Full backup scope: proposed methods, not completed exports

| Component | Proposed capture | Recovery limitation / current status |
|---|---|---|
| Database structure/data | One consistent PG17 custom archive with pg_dump; include schema/data/large objects/sequences and all required private/Auth/Storage/migration areas | Actual permission/managed-object coverage unverified; no namespace exclusions to make a partial file appear full |
| Applications/plans/jobs/duplicates | Included in DB archive; same-snapshot count and ordered-content digest inventory | Preserve all existing rows, never deduplicate or match an old count by deletion |
| Roles/membership/owners/ACL/default ACL | pg_dumpall roles-only with no-role-passwords, plus archive ACL/ownership/security inventory | Role passwords intentionally absent; secure credential recovery remains separate; managed reserved-role compatibility requires verification |
| RLS/functions/triggers/views/extensions | Definition/policy/owner/search_path/extension-version inventory plus archive | Restore original guards; no operating RLS/trigger changes to enable dumping |
| Vault | Only encrypted underlying rows and definitions through the encrypted backup; no decrypted view query | Independent managed encryption-key recovery unresolved; ciphertext presence is not proof of secret restoration |
| Edge Functions | Existing deployed sources, versions/digests and nonsecret config packaged and encrypted on approved PC | Not included in DB dump; actual code export/config capture still pending; no secret values printed |
| Storage | Metadata/policies in database plus separately encrypted object bodies if present at backup time | Currently0 objects; recheck at approved backup time rather than assume permanent emptiness |
| Project/Auth/OAuth/SMTP/JWT/domain settings | Nonsecret recovery inventory; sensitive settings only through separately approved protected handling | Not recovered by DB dump alone; neither browser token nor Vault API key substitutes for DB connection |
| Cron/network/transient state | Coverage inventory and review of any required supplemental capture | Do not activate cron, queue replay, SMTP, webhooks or subscriptions in restore environment |

This does not claim a physical/PITR clone or fully restorable platform backup. Anything inaccessible must be listed as missing and block full recovery PASS; never silently omit or fabricate a replacement.

## Windows execution design (NOT executable approval)

1. Confirm tool binaries/version17 and destination access/ACL, capacity, no unintended synchronization/junction. Folder creation alone proves neither encryption nor OneDrive exclusion. Obtain the existing public recipient's FULL fingerprint and check it against Kleopatra using only public metadata. Do not plug in/read the USB private-key backup.
2. Resolve Direct or Session pooler details via the official project Connect screen. Use TLS hostname/certificate verification and a protected credential input. No password in a URL, arguments, history, transcript, logs or public file; no reset or permission expansion. New tools/install or administrator prompts require approval before executing.
3. Before real data, run a synthetic Windows public-key encryption test. Actual decryption with the user's key needs a separately approved protected path and user-only passphrase entry. USB recovery requires its own approval and remains outside current scope.
4. Under an explicitly approved one-time backup, start pg_dump and gpg as separate processes. Copy raw stdout BaseStream to encryption stdin; do not use a PowerShell text pipeline/redirection for binary archives. Drain bounded stderr concurrently in memory; persist only sanitized failure categories, not secret-bearing error bodies. Check BOTH process exit codes, transfer errors, timeout, nonempty output and intended destination. Do not infer source success from gpg success.
5. Output only date/ref-labelled encrypted .partial.gpg files to C:\SOLQ_보안백업. DB archive, role inventory, supplemental material and manifest are each encrypted; no intermediate plain SQL/archive/JSON/customer file in that folder or TEMP. On any failed producer/consumer/coverage check, stop and leave the candidate explicitly incomplete; never promote it or overwrite a previous good backup. Short lock waits, single/low parallelism and abort-on-permission-error limit operating load.
6. After both processes succeed and completeness/integrity checks pass, atomically rename to final .gpg names. SHA256 of ciphertext detects later changes against a protected reference; OpenPGP integrity verification plus decryption/restore tests are still necessary. A hash is not a substitute for completeness, independent authenticity or a restore. Keep nonsensitive manifest in encrypted form to satisfy the folder's encrypted-files-only rule.
7. Capture roles/settings/code inventories with timestamps and version identifiers; they are not automatically in the DB's MVCC snapshot. No live writes are paused or settings changed under current authorization. Avoid claiming a platform-wide atomic snapshot without evidence.

This is the design contract. The production Windows stream coordinator is not considered implemented/verified merely because synthetic Linux crypto succeeded. It will be finalized against actual PC binaries/recipient/secure input once those prerequisites are confirmed, before separate real-backup approval.

## Isolated restore design

Use an existing approved owner-private PG17/Supabase-compatible target with required roles/extensions and encrypted underlying storage. No production endpoint/credential, public CI, customer-facing app, SMTP/worker/cron/webhook/queue replay or external network. Verify destination identity and network isolation before any import. Original archive remains untouched. Restore roles/dependencies/structure/data/constraints/security with fail-on-error, then compare all required tables' counts/digests, RLS/ACL/function/trigger/sequence definitions and actual scope coverage. List/decrypt via streams where possible; any restored database files must remain on protected encrypted media. Stop on missing extensions/managed-object incompatibility; do not quietly discard sections to force success.

USB private-key restoration, Vault independent secret recovery, existing PC private-key availability and actual operating archive restoration remain distinct unverified checks. Do not read/copy/import the USB backup without separate approval. No encrypted customer material should be uploaded to GitHub/ChatGPT/public cloud just to facilitate restoration.

## Rights, costs, risk, next user actions

- Program licence costs: the proposed PostgreSQL client/Gpg4win route can use free software; no paid service was created. Exact client installation state, disk/egress cost and provider limits remain unverified and must be checked before export. No paid API is involved.
- Read-only pg_dump still imposes load and DDL lock interactions; select a safe window, cap timeouts and stop on failures. No statement about full-backup success is made before a real authorized run.
- Minimal next PC actions: run/review the read-only tool preflight (or provide versions from existing tools), provide only the existing public key fingerprint/validity, and prepare official secure DB connection entry. Never paste passwords/passphrases/private keys into chat. Identify the existing protected restore target; if absent, report it rather than invent one.
- Additional approvals: only missing client-tool installation if needed; separate actual encrypted one-time export with destination/scope/time/cost; separate isolated restore; separate USB secret-key recovery if requested. Current preparation does not authorize any of them. Keys/programs are not recreated merely to bypass missing evidence.

## GitHub / operating preservation

Work branch only. Observed main is now fd918653113e048f29798533f338c09129591406, an independently existing BLOG_TRAFFIC_STATUS.md documentation update dated 2026-10-27; this backup work did not create it and will not reset/merge main. Product/hosting deployment was not performed. Existing Sites deployment22 is the retained baseline; no deployment operation was issued. Customer data and RLS/Auth/Vault/Edge policies were not modified. No actual operating backup, key export/import, payment, paid API or production/customer send ran.
