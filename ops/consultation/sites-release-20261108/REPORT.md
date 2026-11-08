# Issue #9 — SOLQ chatbot visibility and browser verification
Executor: CORE (this session only). GUARD role: evidence review in the same session, not an independently executed worker.
Date: 2026-11-08 KST.
Issue: https://github.com/holykjh1425-stack/jubilant-computing-machine/issues/9

## Outcome
The missing customer-facing chatbot entry is fixed and publicly deployed as Sites version 32.
Live browser-confirmed URL: https://solqtech.com/consultation/
Live home: https://solqtech.com/
Frontend chatbot scope: PASS. End-to-end operational submission/admin certification is NOT claimed. Issue #9 remains open because current administrator Auth/RLS runtime checks and physical-device checks were not performed; no unauthorized test application was created.

## Cause
GitHub commit e410c3055cdf0b230467ddf560253046d055a2d7 had a prototype under ops/consultation and links in the GitHub-root homepage.
The actual solqtech.com host is Sites project appgprj_6ad984f12870819181d960c1bd9ed20a, static.directory=dist.
Actual version 31 source 379d488dd977c738904fe60c3a0f3d22884ded79 contained neither the chatbot nor its manuals/entry links.
This was verified both against the owner-visible deployment metadata and the live homepage before changes. Editing the old GitHub-root NEXUS homepage alone did not update Sites.
No DNS, hosting audience or cache settings were changed. The live browser showed new content after normal reload; no persistent cache issue was observed.

## Scope and provenance
Reused prototype, seven consultation sectors and 21-section routing from e410c305.
Added dist/consultation/index.html, chatbot.js, chatbot.css and both relative JSON manuals.
Changed only existing dist/index.html to add a hero link, fixed 52px+ mobile CTA and the scoped stylesheet.
All prior existing deployment files other than index.html are byte-identical to version 31.
Existing form attributes, controls, required consent checkboxes, scripts, API configuration, administrator files and payment/approval paths are unchanged.
No backend request is made by the chatbot except two same-origin GETs for static manuals.
Answers are held only in page memory, rendered as text and copied only after a user click. They are not sent in URLs, storage, analytics or API requests.
The customer chooses the existing application form and confirms its privacy/overseas-transfer consents before submitting. Summary text is deliberately not automatically inserted or transmitted.
Unapproved church-specific prices and fixed monthly fees were removed from the public manual. Only conditional approved references are shown: 100,000 KRW minimum, 50,000 KRW simple-admin add-on, 300,000 KRW standard reference with one agreed revision, VAT excluded, monthly operation separately quoted.
The original basic deposit 30,000 KRW, quotation consent, manual receipt confirmation and separate production approval remain required.

## Deployment
- Pushed Sites source: 3ad6da253713e9d52d96cb410d2803fcd47784f2
- Saved version ID: appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_4827a974ae888191b0aba644dabfccb4
- Deployment ID: appgdep_6aefdf1ab0f08191afb8237651aaf9b0
- Status: succeeded
- Completed: 2026-11-08 11:32:06 KST (2026-11-08T02:32:06.513712+00:00)
- Archive: 532480 bytes / 41 files
- Archive SHA-256: sha256:9525de2f86cbffb6116bd75ef31e2105cc81d6e4303a0a823489bfee5967cbe7
- Post-deploy get_site: active, public, version 32, current_live_url https://solqtech.com
- Archive contains only deployment files, not verification fixtures or customer data.

## Actual verification
### Isolated preview browser
- 31 static GUARD checks PASS, with script and form-attribute equality to version 31, allowed-file changes, local paths/anchors, approved pricing, no unsafe HTML sinks, no write endpoints/storage, timeout and MIME guards.
- Browser-based 21/21 industry-group routes PASS.
- Church and automation routes use their dedicated questions; manufacturer and restaurant use appropriate industry questions.
- Blank industry and blank answer stay in place with helpful guidance.
- Manufacturer five-answer completion, conditional pricing, summary and clipboard flow PASS.
- A synthetic HTML event-handler payload was displayed as literal text; zero injected images. This was tested only in isolated preview.
- Complex external-integration request prompts human scope/security review.
- Missing-catalog fixture disables guided consultation and keeps application/contact alternatives available.
- Missing-routing fixture retains direct sector selection.
- Restart clears answers/summary.
- 360/384/390 CSS-pixel iframe frames: document clientWidth/scrollWidth 345/345, 369/369, 375/375 (15px scrollbars), no horizontal overflow; fixed CTA height 52px.
- 390px restaurant flow: launcher -> questions -> summary -> application with six required controls and both consent requirements PASS.
- These are real-browser responsive frames, not Android/iOS physical-device tests.

### Live production browser
- Both homepage hero and fixed CTA visible and navigated to the correct public chatbot page.
- Page HTTP 200 observed via browser NavigationTiming.responseStatus, exposed as a DOM diagnostic by the deployed script.
- Both manual GETs HTTP 200, MIME application/json observed from actual Fetch Response.status/content-type.
- Restaurant input -> five questions -> approved prices -> summary -> copy -> https://solqtech.com/#apply PASS.
- Application has six required controls, privacy/transfer consent requirements and enabled submit control.
- NO application submitted; no receipt creation, customer mutation, contract, payment or production execution.
- Server-side urllib health check received HTTP 403 / error code 1010 even though the live browser worked. This is recorded as a client-specific limitation, not a global site outage or a browser failure. No bypass attempted.
- Console tail contained browser-extension metadata errors at chrome-extension:// URLs, not site-script exceptions; no site-script error was observed in the inspected tail.

## GUARD boundaries / remaining
| Item | Result |
|---|---|
| Customer-visible chatbot entry | PASS live |
| Chatbot and JSON HTTP/MIME | PASS live browser |
| Industry questions, price, summary, form navigation | PASS |
| Mobile responsive layout | PASS preview CSS frames |
| Input/XSS and no new write/API paths | PASS scoped review/preview |
| Existing form/scripts/admin asset preservation | PASS byte comparison |
| Fresh current administrator authentication | NOT TESTED |
| Current runtime RLS/authorization denial | NOT TESTED; no policy changes |
| Operational test submission / new receipt | NOT RUN; requires separate permitted test scope |
| Android/iOS physical-device operation | NOT TESTED |
The frontend outage is resolved. Full operational certification / completion of every Issue #9 gate is withheld. No untested gate is marked PASS.

## Evidence
Source files and verification outputs in this release snapshot match the pushed deployed source.
- verification/static-guard.json
- verification/browser-preview.json
- verification/production-browser.json
- evidence/production-home-20261108.jpg (actual public homepage; no customer data)
The preview mobile screenshot is also retained in the Sites source evidence at deployed source 3ad6da253713e9d52d96cb410d2803fcd47784f2.
Screenshots are not presented as physical-device observations.

## Rollback
Redeploy the existing saved version 31:
appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_bdd883e2470081919502e412dd4e06bc
Source: 379d488dd977c738904fe60c3a0f3d22884ded79.
No DB restoration is needed for this frontend-only change.
Rollback if chatbot/asset paths fail, unapproved automatic transmission appears, the existing form fails because of this change, or a new high-risk defect is established.
Rollback would remove the new chatbot/button only and preserve the prior data-deletion notice. No rollback executed or falsely claimed as tested.

## Protection / cost
GitHub main unchanged; snapshot and report kept on fix/solq-chatbot-sites-20261108.
No operational DB/RLS/Auth/cron/Edge/key/payment-setting change, no customer-data read/export/write, no synthetic application, no paid AI API call, no new server or purchase.
Administrator auto-generation fix remains CLOSED.
Existing 51 PASS tests were not rerun.
Additional paid resource/call purchases: 0.
