# SOLQ last blockers: existing-resource investigation and safe authentication route

Basis: 60a39dca85afc5a234990a10d422b7491ea28696. Existing SQL16, client5 and PostgreSQL17.11 independent32 approval/generation PASS evidence reused, not rerun. No production rollout approval requested because mandatory conditions remain incomplete.

## What was actually established

- Connected Supabase project inventory contains only the existing SOLQ production project. Development branch list is empty. No approved nonproduction Supabase backend is accessible through this connection. This does not prove that no separate resource exists on the owner's PC.
- Work browser inventory: Chrome, zero tabs. The user's separately logged-in Owner desktop/browser is not exposed here. No login retry, password search, cookie/session extraction, Owner logout, account creation or organization change.
- The SOLQ application has one registered admin, one email-confirmed admin, and email provider identity. This is NOT proof of a current login or password availability. Supabase dashboard Owner login and the application's Auth login remain distinct.
- Existing isolated-flow/quote-ui-qa resources are mocked UI/static environments. They lack an actual Auth/PostgREST/Edge/backend and cannot satisfy genuine API integration. No mock response is promoted to production PASS.
- Production nexus-orchestrator version7 source was inspected: capabilities passes existing actual user/admin checks, then returns static capabilities/paid_calls=0/external_execution_enabled=false. It does not call tick/submit/snapshot or write an application/job. No authenticated Edge invocation was executed without credentials.

## Concrete safe authentication path prepared

`readonly_auth_check.py` is a human-run, non-hosted terminal checker for the owner's existing trusted PC. It uses the standard library and existing repository config.js/public publishable key; no new server, hosting, CORS change, dependency installation or deployment. It NEVER loads admin.js or the automatic generator.

From an existing working copy containing this candidate:

    python ops/free-generation-approval/readonly_auth_check.py

The existing registered SOLQ application administrator enters the email/password directly into the local hidden terminal prompts. Never send them in chat, command arguments, environment variables or screenshots. The script refuses a noninteractive terminal, redirects, unexpected project, unapproved routes and extra login-body fields. One password login attempt only, no refresh/retry. Password/Tokens are held only in memory and not printed/persisted. A normal Auth login can create session/security-log metadata; no business table or approval write is permitted.

Allowed traffic only: POST official Auth password token endpoint; GET official Auth user; GET own admin membership; HEAD exact counts for three business tables; POST fixed Edge capabilities body. Any other POST/PATCH/DELETE, generation/submit/tick/approval/production RPC is blocked before network. Output contains only boolean results and counts, not identity/token/customer information. A failure stops without automatic retry. Invalid credentials, MFA/CAPTCHA requirements, unavailable password or an unsupported existing login method must stop; do not change/reset the account merely to run this checker.

New checker-only safety tests: four PASS (write route denial, transport never reached for denied request, minimal redacted output, failed login no retry). These use an injected synthetic transport and do NOT constitute actual Auth/PostgREST/Edge PASS. Actual execution requires the human's protected existing credential entry on the trusted PC. No credential was requested in chat and this checker was not executed against production with real credentials here.

This checker resolves the unsafe-admin-page dependency for a future read-only authentication check. Its backend is still the existing production project's read APIs, NOT a nonproduction backend. It can prove current Auth/membership/read/capabilities only; it cannot prove the unapplied approval RPC, candidate quote API or full nonproduction approval integration. For that, an existing approved backend with real Auth/PostgREST/Edge must be made accessible. Do not create a paid branch/project or copy operating Auth/customer data into public CI.

## Backup: preserve prior plan and concrete prerequisites

The existing manual full-logical-backup plan was reused. Free-tier automated-list investigation remains closed. The plan already covers roles/schema/data/RLS/functions/triggers/sequences/private/auth/storage/Vault and external recovery dependencies. No dump/export/encryption/restore was executed.

Current official documentation confirms: free projects can use a manual export; Storage file bodies and Edge/provider/JWT/SMTP settings need separate recovery treatment. Raw pg_dump can include managed internals that fail on restore; CLI dumps filter internals and cannot be called a full platform backup without a verified inclusion/exclusion inventory. Never silently omit missing Auth/private/Vault/config items to make restoration pass. Preserve the original archive and document any target-side adaptation; never change production triggers/RLS to facilitate it.

Required existing resources before execution:

1. Owner-controlled encrypted destination path, its access list, retention and separate encrypted copy location. Work scratch and public GitHub/CI are not destinations for customer backups.
2. Trusted existing encryption public key/fingerprint and separately held private recovery key/custodian; demonstrate synthetic encryption/decryption before real data. No key extraction or new key creation performed.
3. Official Connect page's direct/session-pooler connection and protected DB credential/passfile, TLS verification; no password reset, API-key substitution or browser-token reuse. MCP postgres SQL access is not a pg_dump password.
4. Existing approved private PG17/Supabase-compatible restore target with Auth/Storage/Vault/extension dependencies. Disable cron/workers/SMTP/webhooks/replication/network before restore. The past GitHub synthetic contention container was removed and is not a protected real-data recovery target.
5. Account-specific export/egress/target disk/compute cost and load window. No new paid service is required by the proposed existing-PC method, but zero total cost is NOT verified; data egress and local capacity may matter. Report confirmed cost/permission/load risks before actual execution and obtain scoped backup/export/restore approval.

Minimum operational sequence once those resources are accessible: validate identities/destination/key/TLS and coverage -> obtain explicit one-time encrypted-export plus isolated-restore approval -> consistent read-only dump streamed directly to encryption with failure/lock timeouts -> integrity/coverage inventory -> private isolated restore -> counts/content/security/behavior comparison -> genuine candidate Auth/PostgREST/Edge checks. Native contention PASS is reused. Only then request separate production SQL/API/assets rollout approval using README's reviewed order/rollback. Never restore operating data into public CI or the production project for a test.

Official sources reviewed:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Preservation / result

Production remains applications9/plans6/jobs7, including existing duplicates. Latest application/plan/job/task fingerprints equal the previous evidence:

- applications e881cecf41e029c88c7c4a644cdc357f
- plans e7642d2d1b7fd3667bede1a79f78568e
- jobs cdf5a01b412ee35d7e718389c9c1d25e
- tasks 431e4ee768fd3c8bd69e8ba7dc5255d9

GitHub main 2f909b23c108ad8a32b25916b0b61148911ea881 retained. Production deployment22, DB/RLS/permissions/customer rows unchanged; no new application, paid API, customer send or actual production. Only work-branch checker/tests/report were prepared. Actual authentication/API integration and whole-backup/isolated restore remain unverified; no all-PASS or rollout approval request.

Necessary user actions, bundled: protected existing application-admin authentication on the trusted PC using the prepared read-only checker; identify/provide access to an existing approved nonproduction backend and the existing encrypted storage/key/PG17 restore target plus official secure DB connection. Secrets/private keys remain off chat. Broad approval alone does not replace these missing resources.
