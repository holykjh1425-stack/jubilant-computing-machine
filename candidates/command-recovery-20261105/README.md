# SOLQ schema recovery and security candidates — 2026-11-05

This directory is **not a production migration or a full database backup**. Do not apply it to the existing production database. It contains schema metadata only, historical SQL recovered through a read-only connection, and synthetic tests.

## Recovered sources and order

1. Existing Supabase platform dependencies: roles, Auth schema/functions, Vault, pg_net and pg_cron. Their genuine implementations must be supplied by the protected target runtime.
2. `00-initial-schema.sql`: missing `applications` and `admin_users` tables, constraints, policies and functional grants, reconstructed from the current catalog. It is not represented as an original historical migration.
3. `history/`: versions 20261018033557 through 20261021215655, in version order (10 files).
4. `10-untracked-approval-prerequisites.sql`: current-catalog recovery of the security-backup metadata table, two approval columns, FK, approval functions/triggers and additional unique index. These changes are not present in the eleven recorded migrations.
5. `history/20261026045157_solq_automatic_free_plans_and_quote_gate.sql`.
6. Existing candidates, when testing the final quote flow: `ops/free-plan-automation/quote-evidence.sql`, then `ops/admin-integration-candidate/quote-deposit-guard.sql`.
7. `security-candidate.sql`, in a reviewed transaction, for the separate security experiment.

Do not replay `ops/free-plan-automation/production-gates.sql` onto this fully reconstructed state: the eleventh historical migration already creates those guard functions/triggers. The historical source directory and `supabase/migrations` are not a one-to-one chronological filename match; see `source-manifest.json`. No existing migration files or history records were modified.

## What was actually tested

```sh
cd candidates/command-recovery-20261105
npm ci --ignore-scripts --no-audit --no-fund
node build.mjs
npm test
```

`package-lock.json` pins PGlite and its integrity. PGlite 0.5.15 runs PostgreSQL 18.6 in WASM; production is PostgreSQL 17.11. This verifies actual PostgreSQL SQL, transactions, RLS role predicates, triggers and file-backed synthetic persistence. It does not verify a native PostgreSQL 17 server, independently concurrent connections, signed JWTs, Supabase Auth, PostgREST or Deno Edge. The previous 33+30 integration checks were not invoked or added to the new test count.

`platform-test-adapters.sql` explicitly substitutes test-only Auth claims, inactive cron metadata, dummy Vault metadata and a network function that raises an error. Four extension CREATE/DROP declarations are skipped in the test replay. The original eleven SQL files remain intact. This adapted replay is not a full, unmodified Supabase platform replay PASS.

The comparison covers 20 application/private tables, 154 columns, 83 constraints, 37 indexes, 21 RLS policies, five triggers, RLS flags, and three public identity-sequence definitions. PGlite PG18 NOT NULL catalog entries are normalized separately using attnotnull. Production table/schema/column/default ACLs are captured, but the harness uses explicit functional grants rather than reproducing all platform ACL defaults. Platform-managed schemas and extensions remain outside the structural equivalence claim.

All test rows are synthetic. The temporary file-backed PGlite store contains no customer information or usable authentication keys. No outbound HTTP requests, provider calls, customer notifications or production writes are performed by the test runner. The final security rollback experiment restores legacy RPC definitions and confirms customer tables are retained.

## Security candidate

The three public RPC signatures remain the same. Their public functions become SECURITY INVOKER wrappers. Validated private SECURITY DEFINER bodies belong to a dedicated NOLOGIN, NOSUPERUSER, NOBYPASSRLS role with column-specific grants and RLS policies. Public application submission and token-scoped support access remain usable. The owner role has no membership granted to anon/authenticated. The direct Auth claims in the test are synthetic and do not establish real administrator authentication.

Read-only live privilege checks additionally confirmed anon/authenticated management rights on `admin_users`, including TRUNCATE and TRIGGER, plus MAINTAIN on `applications`. The candidate revokes the confirmed ancillary rights without removing intake INSERT or admin SELECT/UPDATE. These privileges were not exercised against production. Default ACLs in `access-metadata.json` also require a separate final review so new objects do not inherit unnecessary management rights.

`security-rollback.sql` is tested in isolation. It restores the original RPC bodies and confirmed ancillary grants; therefore it also restores legacy security risks. It is a reviewable rollback option, not an instruction to weaken production. The leaked-password setting remains unchanged; official documentation places its configuration in Auth settings and says it is available on Pro and above. Its actual login/session impact must be checked before a separate operational approval.

## Remaining execution gates

- Native protected Supabase runtime with PostgreSQL 17 and genuine extensions, Auth/JWT, PostgREST and Edge; no production keys reused. This Work runtime maps only UID 0 and has no Docker binary; native PostgreSQL requires an unprivileged user. Namespace remapping was denied. No replacement paid environment was created.
- Actual independent-session concurrency and the final PC/mobile authenticated UI against the reconstructed native target.
- A safe full encrypted production backup, integrity verification and a real protected restore. Catalog JSON, dummy Vault metadata and synthetic persistence are not substitutes. No production data was exported.
- Actual backup recovery-point evidence, protected encrypted destination, recovery-key custody, database access and restoration access control. The Work session has no direct access to the user's Windows key store or USB private key.
- Support SU-536243 links SU-533612/SU-526318. The read thread contains the 2026-11-03 acknowledgement and specialized-security-team transfer, without a substantive technical backup/restore solution.
- External recovery inventory: Auth configuration and version-compatible Auth tables; Storage metadata/policies **and object bytes**; Edge source/deployment configuration; project settings/OAuth/SMTP/DNS; secure Vault/secret recovery via an approved protected mechanism. Database-only exports do not cover all these items.
- Separate approval before any production rights/settings change, deployment, chargeable resource or main merge.

## Deployment and rollback order after all gates pass

1. Verify current production fingerprints and the actual full backup/restore evidence; freeze the reviewed source commit and stop if the live schema or data changed.
2. In the protected native target, run the complete final candidate with genuine Auth/JWT/Edge and independent sessions. Reconcile the captured ACL/default-ACL differences. Do not apply the recovered baseline to production.
3. Prepare a production-only change list: approved read-only admin assets, additive quote/deposit SQL, reviewed minimal-rights candidate and required Edge assets. Keep the public homepage/design and approved server free-plan path unchanged.
4. Obtain explicit operational approval for that exact file/SQL/config list, then apply only the reviewed deltas. Recheck reads, authorization, queue gates and data fingerprints. Do not send real customer messages or start paid production for validation.
5. On failure, stop new writes. Roll back only the reviewed new delta using recorded pre-change definitions and the verified backup plan. Do not drop/recreate the production database or restore old administrator code that automatically generates work.

Current overall deployment decision: **NO-GO**.
