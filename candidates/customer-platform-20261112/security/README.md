# Customer identity, chat and preview isolation — candidate only

2026-11-12 KST. Not deployed, no live Auth login, no production schema/data changes, no messages sent, no paid calls. Existing customer rows, approval functions and table grants are not changed.

## Implemented boundaries

| Area | Candidate behavior |
|---|---|
| Identity | Supabase server getUser identity + current session expiry + confirmed email/phone; no user_metadata authorization |
| Account mapping | Auth uid → solq_customer_cases → existing applications.id; customer cannot self-insert or change ownership |
| Normal enrollment | Server-only lifecycle issues a 256-bit account-bound 5-minute private proof after trusted intake returns its internal ID; hashes only are stored and consume+case binding is atomic |
| Recovery mapping | Existing admin_users membership may provision a case with verification evidence reference. This is an exceptional recovery path, not a third mandatory manual production gate |
| Chat consent | Explicit append-only chat-v1 consent events. No message or revision record before acceptance; withdrawal prevents later inserts |
| Messages | Customers append only own role=customer records. Authenticated clients cannot forge worker/assistant messages, actors or case ownership |
| Revisions | Customer can only append own status=received request. This does not approve scope, budget or production |
| Previews/files | Own validated versions/files readable; draft and cross-customer artifacts denied; customer cannot insert/update preview status or artifacts |
| Retention | No client update/delete/truncate. No automatic cleanup or 30-day retention rule introduced |
| Abuse/timestamps | DB-owned insert timestamp; per-case candidate limits 12 messages / 3 revision requests / 10 consent events per minute |
| Worker boundary | Server must derive actorId=case.account_id and applicationId=case.application_id and independently revalidate existing quote/deposit/separate approval/cost/lease constraints |

New tables: solq_customer_cases, solq_customer_consent_events, solq_customer_messages, solq_customer_requests, solq_customer_previews, solq_customer_artifacts. They are only in `customer-schema.candidate.sql`, not operating migrations. Public API grants start explicitly revoked. No new public security-definer RPC exists. New trigger uses caller rights and only touches new tables. New owner/index/FK predicates are indexed. Existing applications remain admin-only; customer-facing data comes from the new case facade, not expanded access to old customer rows.

## Adapter contract

`createCustomerRepository({db, enabled=false, clock})` from customer-repository.mjs.

- `verify()` → authenticated verified user including `expiresAt` in epoch milliseconds; rejects disabled candidate, missing/expired identity and mismatch.
- `listCases()` → `{items,total,complete}` with `id,application_id,created_at`.
- `listMessages(caseId)`, `listRequests(caseId)`, `listPreviews(caseId)` → `{items,total,complete}`, newest up to 100, marked partial beyond that limit.
- `setChatConsent(caseId, accepted)` explicitly records acceptance/withdrawal.
- `appendMessage(caseId, content, {clientMessageId})` inserts a customer message only after DB ownership/consent checks.
- `requestRevision(caseId, {message,expectedVersion,clientRequestId})` inserts a received request; never changes a customer/production status.
- `readArtifact(caseId, version)` returns own validated `index.html`/`styles.css` text + sha256 metadata. It does not execute generated content.
- `createCase({applicationId,accountId,verificationReference})` is admin-only exceptional provisioning, not a receipt/name claim endpoint.
- `clear()` invalidates old responses. UI must call it on Auth change/logout and clear displayed customer state. Adapter revalidates identities before returning reads and writes; uncertain writes are not retried automatically. Retain client-generated IDs for reconciliation.

`createEnrollmentLifecycle({enabled=false,authenticate,submitIntake,store,clock,ttlMs=300000})` from enrollment-lifecycle.mjs implements the issuer/exchange lifecycle in a trusted server runtime:

1. `submitAndIssue({authorization,application})` verifies Auth and confirmed identity, rejects client internal IDs/ownership fields, then invokes trusted existing-intake adapter. Only its authoritative `{applicationId,receiptNumber}` may identify the application. A legacy receipt-only result fails closed.
2. Generates 32 cryptographically random bytes (256 bits, 43-character base64url proof) and returns the raw proof once, with expiry. Stores only SHA-256, Auth account, application, receipt, fixed enrollment purpose, expiry and consumption metadata. Default lifetime 5 minutes, maximum 15 minutes, bounded by the verified Auth expiry.
3. `exchange({authorization,receiptNumber,enrollmentProof})` revalidates Auth. Store performs atomic conditional consume and case binding; wrong account/receipt, expiry and replay fail. Binding failure rolls consumption back.
4. `createMemoryEnrollmentStore()` is the isolated single-process serialized model. `createServerEnrollmentStore({serverDb,enabled=false})` uses restricted server RPCs from enrollment-proof.candidate.sql. Raw proof is never stored or logged. Browser roles cannot invoke issuer/exchange RPCs or access private proof storage.

`createCustomerLinkHandler({enabled=false,allowedOrigins,lifecycle})` is a bounded-body, strict-Origin HTTP wrapper around this same atomic lifecycle. It does not use a separate verify-then-bind callback path. It accepts only receiptNumber + private enrollmentProof alongside verified Bearer identity, never name or caller application/account IDs.

The candidate issuer currently requires a verified Auth account before proof issuance. Existing anonymous `submit_application` returns only a receipt, so it cannot silently gain enrollment authority. Connecting a trusted success response/internal application ID and the verified account into this lifecycle is still an operating integration task. The anonymous-first production path needs that secure bridge; this candidate never falls back to receipt/name claiming. Admin createCase remains an exceptional recovery option, not an additional mandatory manual production step. No actual proof or customer notification has been issued in the operating service.

## Actual isolated verification

`node --test candidates/customer-platform-20261112/security/{customer-security,account-link,enrollment}.test.mjs`

22 tests pass (including 13 PostgreSQL subtests plus their 2 parent suites and 7 JS/server lifecycle checks). See test-results.txt. This is actual PGlite PostgreSQL execution with synthetic A/B/admin rows, not a live Supabase Auth server.

Verified: ordinary customer self-claim rejected; A/B case/chat/request/consent isolation; anonymous/expired rejection; explicit consent and withdrawal; no spoofed worker actor; no mutable history; private validated artifact isolation; draft denied; no client preview promotion; server time overwrites attempted backdating; bounded insert rate; existing customer rows and grants identical; default repository disabled; verified identity required; identity switch discards old account response; server enrollment rejects receipt/name, foreign Origin, unverified user and another account's proof; 256-bit hash-only issuance, one successful in-process exchange among 20 concurrent requests, expiry/replay rejection, SQL server-only RPC access, original application/receipt matching, bounded proof lifetime and consumption rollback on binding conflict.

The tests serialize statements on one PGlite connection. Multi-session rate-limit/advisory-lock race behavior and hosted load are not independently measured. Existing token revocation/session_id enforcement and actual Auth/CORS/hosting paths still need protected real-environment verification before operating enablement.

## Outstanding production work

1. Approve/review the new schema, role grants and policies; inspect current project table-name conflicts and advisors. Generate a formal migration using the current CLI only after approval. The new private proof schema and restricted service RPCs are an additional candidate after customer-schema.candidate.sql; no old customer table grants change.
2. Connect the isolated account-bound enrollment issuer/exchange to actual verified customer Auth and trusted existing intake success. No automatic account registration, password reset, email or OTP message is sent by this candidate.
3. Connect worker writes only through the existing trusted server authority. This candidate does not grant a service role or worker token to any browser.
4. Validate generated artifact hashes/content on the server before insertion, then render using the separate sandbox layer. DB only constrains digest syntax; it does not prove the digest or code safety. Binary Storage object/bucket/signed-URL integration is not implemented; current artifacts are bounded HTML/CSS text.
5. Apply server/perimeter request limits, real session revocation checks, contact verification/enrollment recovery and operational monitoring. DB insert rate limits alone do not control login abuse or infrastructure traffic.
6. Run actual A/B sessions, expired/revoked tokens and protected preview checks without customer data exposure. Operating deployment remains NO-GO.

Official design reference reviewed: https://supabase.com/docs/guides/database/postgres/row-level-security . RLS predicates use authenticated uid/expiry and server-owned mappings, not editable metadata.
