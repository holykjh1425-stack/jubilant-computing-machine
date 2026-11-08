# SOLQ GitHub Pages authentication-only candidate

Scope: dev/solq-automation-preservation-20261026, based on bec4fc0. This is source preparation, not deployment or a login request.

## New application files

- admin-auth-check.html
- admin-auth-check.js

No existing admin.html/admin.js/orchestrator-admin.js/production-admin.js was edited or loaded. No SDK, external stylesheet/script, generic config script or existing admin session is loaded. The public Supabase publishable identifier is pinned in the new JS; it is not a service-role key or secret. No customer content, password, JWT, cookie or session is in these source files.

The page allows explicit human login only when it is the top-level secure HTTPS page at the exact GitHub Pages Origin and application path. Local file, Library preview, different Origin/path and iframe contexts leave all credential controls disabled and cannot send API requests. The candidate has not been published, so there is currently no usable deployed page URL. Do not repeat the earlier local-file download procedure for this candidate.

## Allowed behavior

One explicit submit performs only:

1. POST /auth/v1/token?grant_type=password with direct human input.
2. GET /auth/v1/user with the returned access token; validate actual identity.
3. GET /rest/v1/admin_users restricted to that identity, select=user_id and limit=2.
4. Only on exact membership: POST /functions/v1/nexus-orchestrator with the immutable body {"action":"capabilities"}. The existing Edge function also validates actual user/admin membership server-side. Accept success only when paid_calls=0 and external_execution_enabled=false; show no raw agent/task/customer response.
5. Finally POST /auth/v1/logout?scope=local for this newly issued session, including when intermediate checks fail. No global sign-out of other existing sessions. If logout fails, retain only the current in-memory token for an explicit logout retry and display failure. Do not say the session ended until the request succeeds.

No customer table/count query, automatic timer, tick, submit, snapshot, plan generation, approval, production, state edit, registration, reset, refresh or external send is included. No requests occur on page load. Login is attempted once per page lifetime. The password/email inputs are cleared as submission begins; credentials and session exist transiently in memory and HTTPS transport only. No local/session storage, cookies, logs, URL credentials, token output or automatic refresh is used. Normal Auth session/security-log metadata can be created server-side by login; that is distinct from business DB writes.

## Security controls and precise limits

CSP default-src none; connect-src only the exact existing project's HTTPS endpoint; no child frames/workers/objects/forms/base URL. The only script is the new same-origin JS, protected by matching CSP SHA256 and SRI integrity. HTML/JS must be published atomically; a mismatched hash blocks script execution with credential fields remaining disabled. No third-party CDN. Text results use textContent, never raw backend messages or identity data. Request routes/methods/bodies are allowlisted; redirects, browser credentials and caching are disabled, requests have a timeout. Network/CORS/TLS ambiguity is not mislabeled an authentication rejection; explicit HTTP401/403 and invalid capability payloads are separate failures.

The page is PUBLIC if published on GitHub Pages; noindex and a private-sounding title do not create access control. Authentication before backend data is enforced by existing Supabase policies and Edge checks, not merely hidden controls. Browser/password-manager defaults and developer-tools network capture cannot be controlled completely by an application; the page does not persist or log secrets and warns users not to share network captures.

frame-src in meta CSP blocks child frames; JavaScript top-level/context checks prevent credential entry while embedded. It does not install an HTTP frame-ancestors/X-Frame-Options header or claim that a meta tag prevents the page itself from being embedded. GitHub Pages custom-header limitations and same-Origin trust across repositories remain risks. Compromised source/publication can change a login form, so review and trusted publisher control are required. Do not expose any new API permissions or weaken existing RLS.

Logout revokes the current session's refresh capability according to existing Auth behavior; an already issued access token can remain valid until expiry. Closing the tab early/network failure can prevent the logout request. The page warns before navigation while active but cannot guarantee cleanup after process termination. No security policy is changed to address this.

## Isolated evidence

New tests: tests/auth-page/test.mjs and results.json, 11 PASS. Uses the existing pinned linkedom dependency via tests/free-generation/package.json or SOLQ_TEST_DEPS. No new dependency versions/lockfiles. Cases include disabled initial state, unsupported Origin/path/iframe/insecure contexts, allowlisted five-request flow, credential redaction/no storage, non-admin/mismatched membership denial, malformed/expired identity denial, password failure/no retry, precise Edge failure categories, logout failure/manual retry, duplicate-submit guard, and script/CSP/SRI integrity.

These tests use a synthetic DOM and injected HTTP responses. They do not prove real browser CSP/SRI execution or genuine Auth/Edge integration. Previous user-provided actual Auth/admin/PostgREST PASS, SQL/client PASS and native approval contention PASS were reused without rerun. Prior real OPTIONS evidence already establishes GitHub Pages Origin CORS acceptance (204); it is not authenticated capabilities PASS. No real login or new approval RPC was invoked here.

Run new tests only, with installed pinned dependencies:

    node tests/auth-page/test.mjs

## Minimal actual verification and approvals

After separate explicit approval of public Pages publication, first identify its configured deployment source (branch/build currently not verified through the connector's restricted Pages management endpoint). Approve any required source-branch/main change separately; never assume that work-branch commit permits main merge or publication. Publish only the two reviewed application files without replacing existing admin/customer files, with matching hashes and cache review. Verify script load/CSP/SRI and top-level path without credentials. Then a separately authorized explicit human login can validate real membership and Edge capabilities, followed by current-session logout. Do not ask for a fresh password now or reuse/extract the already logged-out local session.

No-publication alternative: the existing readonly_auth_check.py on the owner's trusted PC calls official Auth, membership and Edge capabilities over HTTPS without a browser Origin; the current Edge handler permits absent Origin and still requires genuine user/admin authentication. This avoids browser CORS, changes no policies, and creates no server. It requires authorized protected credential entry; the previous finished session is not transferable. That older checker additionally reads table counts; use its reviewed behavior only when that wider read-only scope is authorized. It is not a browser-page runtime test. Synthetic tests can verify this new page offline without any credentials, but cannot replace actual Edge integration.

Whole operating backup and protected isolated restore remain separate outstanding production-rollout gates. This authentication page publication would not authorize SQL migration, new approval API deployment, paid processing, customer communication or an actual test application.

## Preservation

Only new candidate application/test/document files were prepared on the work branch. No production DB writes/DDL/RLS/Edge changes, no admin screen load, no actual new application, no paid API or production execution, no GitHub main change or Pages/Sites deployment. Existing 9 applications/6 plans/7 jobs and historical duplicates remain the latest verified baseline; counts/authentication were deliberately not retested. Sites version22 is unaffected. To abandon this unpublished candidate, omit its files; no operating-data rollback is necessary.
