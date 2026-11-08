# SOLQ automatic free plans

Runs inside the existing minute production tick. New applications only; existing plans are never replaced. Rule-based planning only, with no model or external calls. Automated records use a NULL human creator and explicit engine metadata rather than impersonating an administrator.

Deployment: apply `automation.sql` atomically after taking the database backup included at its beginning. Inspect `public.solq_free_plan_runs` and the existing cron run history. Free jobs stop at `awaiting_approval`; production remains `awaiting_deposit`.

Recovery: restore the backed-up tick and function definitions from `nexus_production_private.security_backups` (key `solq_free_plan_automation_v1`), then disable this free cycle. Keep all additive tables, unique indexes, and consent gates. Do not delete generated records or remove the quotation gate. A code rollback must preserve customer data and production safety.

Quotation acceptance is additive and defaults to absent. No legacy consent is inferred. Future recording requires real evidence identifying the application, specific quotation/version, agreed amount, acceptance time and evidence reference. The privileged recording workflow is intentionally not invented here.


## Follow-up: prepared, NOT deployed

`quote-evidence.sql`, `solq-quote-evidence` function and `quote-evidence-admin.js` form a reviewed-admin evidence registration and retrieval workflow. New UI is added to the repository's admin.html only. The live hosted site has a newer visual shell and must be reconciled before any future deployment; do not deploy this older shell wholesale.

The server verifies the user's JWT and admin membership and forwards that same JWT to the RPC. The DB derives verified_by from auth.uid(), rejects caller-supplied verifier/timestamp, locks the application/job, links only matching evidence, and blocks updates/deletes and relinking. Existing RLS policies are untouched. A privileged database owner can still alter schema; append-only is not protection against the database owner. An administrator must inspect the actual external customer evidence; this does not cryptographically prove customer identity or the contents of an external reference. Do not invent customer consent. No actual customer consent was entered.

Acceptance is absent/false when no evidence exists. A successful acceptance record contains amount, quote version, actual acceptance timestamp, evidence reference, server-derived verifier and recording timestamp. A linked quote cannot be replaced through this workflow. Corrections/version changes after recording require a separately reviewed audited supersession design; deleting evidence is forbidden.

Future deployment order (not authorized by this task): inspect current schema and backup function definitions; apply quote-evidence.sql transactionally; deploy the new authenticated Edge Function; integrate the panel into the current live admin shell. Verify with synthetic data in isolation first. Never apply automation.sql again to the current production schema.

Rollback for this prepared follow-up: remove the added panel script and disable the new Edge Function; revoke authenticated EXECUTE on public.solq_record_quote_evidence(jsonb) and nexus_production_private.record_quote(jsonb). Retain evidence, its immutable trigger and all production gates. Existing free automation must continue. The existing rollback.sql stops the old free cycle and is emergency-only, not part of this follow-up.

Validation: node --test tests/automatic-free-plans.test.mjs tests/quote-evidence-api.test.mjs tests/production-core.test.mjs tests/production-runtime.test.mjs. All inputs are synthetic. The baseline functions fixture replaces the operational project URL with YOUR-PROJECT; it is a local harness fixture, not a production restore dump. No secrets, customer row dumps, or live DB connection values are included in new files.
