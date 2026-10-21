# NEXUS customer automation — review before activation

This branch adds an independent customer pipeline. It does not change the existing application form, receipt RPC, deposit-confirmation logic, support logic, customer policies or the three existing application rows. The only existing page change loads an additional administrator panel. No new project or account is needed.

## Implemented flow

1. Existing intake remains valid. After deployment, a separate minute schedule captures only applications created after migration time. Existing three customers are excluded. An optional `order.html` intake creates a receipt and private status link atomically and idempotently.
2. Rules classify requests and assign websites/custom systems to Codex, automation/consulting to OpenAI. This is a free rules engine, not a paid LLM analysis call. Existing interactive previews are reused; they are demonstrations, not newly generated customer work.
3. Only the existing administrator deposit-confirmation status can make a job eligible. No payment verification, contract acceptance or payment processing is automated.
4. The private controller verifies runtime authentication, then claims one task only if the database provider is enabled, recently verified, has an explicit model and approved call capacity. OpenAI additionally requires verified credit and an atomic dollar-budget reservation. Both providers default to disabled; OpenAI has no installed key and no verified balance.
5. Codex runs noninteractively using existing ChatGPT authentication, in an empty temporary directory, read-only sandbox, shell tool disabled, ephemeral session and structured JSON output. It creates reviewable source-file contents; generated code is never run, deployed or merged automatically. Parent controller secrets and API keys are not inherited by the child.
6. Result size, path safety, JSON syntax, secret patterns and SHA-256 hashes are checked. The controller also parses JavaScript syntax without running it. Results and attempt usage are saved, then await administrator review. The HTTP boundary independently validates the artifact rather than trusting the worker's `passed` flag.
7. The administrator reviews the exact stored result hash before releasing it. The private customer link then provides per-file downloads and a script-disabled HTML preview. Customers do not receive another customer's information. Manual sharing of the private link is still required; email/SMS delivery is not integrated.

## Credentials and interfaces

| Interface | Implemented | Remaining prerequisite |
|---|---|---|
| OpenAI Responses API | Bounded structured-output adapter; no automatic retry; credit, model, budget and call gates | Verify positive balance, obtain explicit paid-call approval, configure server-only key and rates |
| Codex CLI | Actual subprocess adapter, ChatGPT auth preflight, structured artifact/result collection | Private continuously running controller host, approved model/call capacity and deployment |
| Claude | Extension point only; throws `claude_on_hold`; no Anthropic route | Future explicit authorization; HTTP 400 is not retried |
| ChatGPT Work | No verified unattended remote-control interface configured | Remains incomplete; the Work window is not represented as an API worker |

The private customer link is a 256-bit bearer capability; only its SHA-256 hash is stored, and rotation invalidates the previous link. It is **not a WebAuthn passkey**. True passkey registration/authentication and a general credential vault are not implemented by this change. Existing administrator authentication and Supabase Vault secrets remain in place. Customer names/contact details are not included in the model task, but free-text requirements still require administrator review for personal data and credentials.

## Cost and failure behavior

Provider controls are private database state, unavailable to browser clients. API-key presence alone cannot start inference. `NEXUS_EXECUTION_APPROVED=true` is additionally required by the controller. A credit verification expires after one hour. Output is bounded to 4,096 tokens. OpenAI reserves a conservative maximum input/output cost before inference and retains the reservation for uncertain outcomes. No automatic paid inference retry exists. A timed-out/failed attempt remains consumed, and expired leases become `failed` with an explicit unknown-outcome error. Safe status polling continues. Production re-execution requires a separately reviewed change; it is not exposed as a browser button.

The original central free-orchestrator remains installed. This module adds a customer-specific queue and panel within the same administrator screen; it does not migrate or rerun old tasks. Existing Claude failure records and Vault values are preserved. The previously requested diagnostic flag was set to false separately under the instruction to stop Claude; the consumed global attempt remains intact.

## Deployment and activation checklist

This branch is not a live deployment. Review and approve before merging to the publicly hosted branch or applying the new migration/Edge function. Customer-data changing tests must not be run in production.

1. Check the original customer count and full-row digest against the recorded three-row baseline. Apply `supabase/migrations/20261021213341_production_core.sql` through the Supabase connector, not the blocked CLI invocation.
2. Deploy `supabase/functions/nexus-production/index.ts`, `handler.mjs`, `artifact.mjs` to the existing project. `verify_jwt=false` is required for public capability/intake endpoints; the function validates administrator sessions/membership and worker machine credentials itself. Existing functions are not replaced.
3. Publish approved static files by merging this branch. Original intake stays available. The optional new page has its own link. No administrator login/full-screen verification is included in this task.
4. Provision the controller only on an existing private host. Copy source, install pinned Codex CLI `@openai/codex@0.163.0`, and authorize its existing subscription locally. Never put a ChatGPT session into GitHub Actions. Configure HOME/CODEX_HOME under `/var/lib/nexus`, `NEXUS_CODEX_BIN`, `NEXUS_PROVIDER`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXUS_EXECUTION_APPROVED` in a root-protected `/etc/nexus/production.env`; add `OPENAI_API_KEY` only after credit verification/paid-call approval. The service/timer files are templates and have not been installed or enabled. Review host sandbox support and filesystem paths before activation.
5. Record approved model/call capacity and verification time in `nexus_production_private.providers` through an authorized operator. OpenAI requires approved micro-dollar capacity and nonzero conservative per-token rates. No provider is enabled by this migration. Do not treat the local Codex smoke test as production activation or as OpenAI API balance verification.
6. Check heartbeats, queue status, attempts and events in the additional administrator panel. Successful generation still awaits administrator review. The existing deposit confirmation and cancellation controls remain authoritative.

## Validation and evidence

- `npm run test:production`: 22 passing tests against a disposable PostgreSQL-compatible database and mocked network/process interfaces. Includes preservation of three fictional legacy rows, idempotency, anonymous/nonadmin denial, deposit/cost gates, duplicate prevention, stale leases, validation, exact-hash release and private link rotation.
- Existing `tests/customer-flow.cjs`, `tests/manual-review.cjs`, `tests/written-support.cjs`: passed; no production customers modified.
- Actual Codex connection attempt: existing ChatGPT session was detected, but the one execution attempt timed out after 120 seconds with no accepted result. No automatic retry was performed. Timeout cleanup was subsequently hardened to terminate the full subprocess group. Evidence: `tests/evidence/codex-smoke.json`, `tests/evidence/codex-smoke-artifact.json`. This uses only synthetic requirements and no production database writes. Inspect the recorded outcome rather than assuming success.
- Original production three-row digest: `feb572fff533b9831500efb7c1b4d316`; confirmed unchanged during this task.
- No Claude API call, OpenAI API call, live customer workflow run or administrator login/full-screen verification was performed.

A Supabase CLI invocation was automatically rejected because of attempted analytics transmission. It is not retried or bypassed; SQL and validation use local disposable databases and the supported connector instead.
