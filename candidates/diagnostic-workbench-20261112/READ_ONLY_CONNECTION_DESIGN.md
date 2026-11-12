# Read-only administrator connection design — not deployed

This is a generic design, not a statement of any live project's grants, security warnings or readiness.

## Request boundary

Reuse the existing administrator sign-in method without collecting credentials in a new interface. Send an existing bearer only to an approved same-origin server endpoint. The server validates that exact token with Auth, validates its session identity/expiry/revocation, and reads trusted administrator membership. Never trust a browser-selected role, user metadata, cached session alone, receipt number or customer name as authorization.

Return the snapshot only after rechecking token/session and administrator membership. Expiry, revocation, role loss, timeout, database error or ambiguous result must clear visible details and return a non-success state. Use no-store/no-referrer; do not log bearer values, full request bodies, contact information or query results.

## Database boundary

A GET-only endpoint is not a database permission boundary. A client token or service credential may permit writes elsewhere. Do not use a service-role key, table owner, superuser or BYPASSRLS role for workbench queries.

The preferred production candidate is a separately approved, narrowly granted server database role with:

- no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER table privileges;
- no write column grants, object ownership, role administration or elevated role membership;
- no broad authenticated/service role membership;
- SELECT only on the required tables/columns, session proof columns and own administrator membership;
- schema USAGE limited to the query path and no CREATE;
- role-scoped RLS using the verified subject and trusted administrator membership;
- no executable write-capable SECURITY DEFINER/RPC functions or outbound network functions.

A new role does not automatically match existing RLS policies. Future role/policy/grant changes need isolation testing and explicit production approval. Do not revoke existing application rights as a shortcut. Keep the general customer application flow working.

For each approved snapshot, open a bounded REPEATABLE READ / READ ONLY transaction using the dedicated role, set transaction-local trusted subject claims from the verified token, and run only fixed parameterized SELECT statements. Never accept SQL, table names, RPC names, destinations or role claims from the client. Confirm the actual runtime role and grants and reset all transaction-local state on pooled connection return. READ ONLY transactions are an extra guard, not a substitute for least privilege: routine execution, temporary objects, network extensions and PUBLIC grants require separate review.

## Data minimization

Project a whitelisted DTO: receipt reference, permitted application status, confirmed diagnostic facts with provenance/unknown markers, six plan steps, independent quote/deposit/approval states, link relationships, audit kind and checked-at/source/success metadata. Bound pagination and body sizes. Avoid contact fields and raw plan/result JSON by default; selectively authorize any personal information the administrator actually needs. Never serialize provider keys, tokenized preview URLs, internal notes, credentials, hashes of customer rows or raw SQL errors.

New diagnosis storage stays separate from existing operational tables. No save path exists in this candidate. Future writing requires reauthentication, a concrete approved target/change, before/after audit, distinct write authority and a separately approved migration. Do not automatically create or merge diagnoses while reading.

## Activation gates

Before real connection: verify administrator/non-administrator/anonymous/expired/revoked/cross-session cases in isolation; verify the query role has zero direct or inherited write rights and cannot invoke write/outbound routines; confirm RLS and DTO redaction/pagination; verify failure clears old values; complete mobile and existing-function regression. Deployment/role changes and outbound messages remain disabled until separately approved. Rollback disables the new read endpoint/UI and retains existing operational data unchanged.
