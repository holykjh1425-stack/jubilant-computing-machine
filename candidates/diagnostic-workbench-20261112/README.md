# SOLQ diagnostic workbench — synthetic source candidate

This standalone export contains synthetic examples only. It is not connected to production Auth, customer data, SMTP, payments, a worker, or any deployment.

## Run locally

```sh
node --test workbench.test.mjs
node server.mjs --host 127.0.0.1 --port 3000
```

No additional packages are required. The default server binds to loopback. All mutation HTTP methods are rejected. The demo session button and header are synthetic UI controls, not administrator authentication. Never put real customer information behind the demo endpoint. The live endpoint remains disabled.

`public/` contains the responsive Korean interface: receipt search, integrity filters, eight diagnostic sections, deterministic follow-up questions with reasons, temporary in-memory branch exploration, plan comparison, independent quote/deposit/production approval states, and separate audit/evidence display. Changing the exploratory answer never saves or changes the source records. No browser storage is used. Evidence links use a reserved example domain.

`reader.mjs` and `server-authenticator.mjs` are server-only dependency-injection candidates. Exact-token authentication, session validity, administrator membership before and after a read, and method restrictions are tested with synthetic identities. Real adapters, credentials and policies are absent. Unit tests do not prove a live Auth/RLS integration.

The public preservation panel contains no production baseline, live counts, row fingerprints, current permission findings or customer identifiers. No screenshots or production reports are included. All DEMO receipts and example UUIDs are synthetic. Coverage measures supplied diagnostic fields, not business facts verified by an investigator.

See `READ_ONLY_CONNECTION_DESIGN.md` for a generic server integration design. Deployment, production permission changes, customer data connection and all outbound messages require separate authorization. This package must be copied by an exact file allowlist onto an approved repository base. Do not push an existing local branch containing private evidence in its history.
