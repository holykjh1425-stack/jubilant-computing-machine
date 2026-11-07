# SOLQ deletion notice — Sites 30 deployment / final verification BLOCKED

Executor: ATLAS (this session; no delegated worker).
Deployment completed: 2026-11-07 10:38:29 UTC / 19:38:29 KST.
Scope: deletion notice and necessary retention text/navigation consistency only.
Overall GUARD decision: NO-GO pending production HTTP 200 and production-page confirmation.

## Cause and source provenance
The GitHub candidate at fd36dfe331f2c24dc3e78966df9745ba66e0884c contains a root data-deletion.html. The public GitHub Pages copy returned HTTP 200 (4,985 bytes) in this session.
However, solqtech.com is attached to Sites project appgprj_6ad984f12870819181d960c1bd9ed20a, not that GitHub Pages output. The operating version 29 source (182ab212056ac89e3dcf4f08d37c7aa53ea47f47) serves dist/ and had no dist/data-deletion.html.
This missing file in the actual deployment artifact explains why the GitHub change alone did not publish the requested route.
The GitHub Pages settings API was unavailable through the connected tool; its configured branch/folder was not verified and was not modified. No DNS/domain/access settings were modified.

## Actual deployment
- Previous saved version: 29; appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_3ff2be3f215481918546d24a4169a9c8.
- Previous source: 182ab212056ac89e3dcf4f08d37c7aa53ea47f47.
- New pushed Sites source: 0eccd72081b28f8df20e15814472ad60ba6bb5fd.
- New saved version: 30; appgprj_6ad984f12870819181d960c1bd9ed20a~appgver_fa368ae1b51881919c96e0329cce2762.
- Deployment: appgdep_6aeeff99f6708191a8358e267be4e90d; succeeded.
- Native get_site after deployment: active, public, latest version 30, current_live_url https://solqtech.com.
- Custom domains solqtech.com and www.solqtech.com: active, provider active, SSL active, same pre-existing worker.
- Saved archive: 36 files; 491,520 bytes; SHA-256 3b1e04f05728e78a2a66e3472693307663f096f8262905ca52d5d0278c22014e.
- Requested production route: https://solqtech.com/data-deletion.html.

## Exact deployed changes
1. dist/data-deletion.html — reuse candidate content; existing SOLQ legal styling, deletion methods, affected data, conditional legal retention, private inquiry link and existing public contact fallback. No script, form, API call or automatic deletion implementation added.
2. dist/privacy.html — consistent purpose/request-based retention text and deletion notice link.
3. dist/index.html — same consent summary text consistency and link inside existing footer menu; no design or form-control change.
4. dist/support.html — same retention text consistency and deletion FAQ link; no form-control or script change.
All other existing dist files, including admin files, application/support scripts, configuration, styles and assets, were byte-identical to version 29.
Temporary responsive QA file was removed before packaging and is absent from the deployment archive.

### File SHA-256
- dist/data-deletion.html: 5cd31cd791725bced93dccd3ce0b3caabc4cfb22e6b5a824ee142f2b3cc277df
- dist/index.html: cf013b15381fa1df4f1fca87b00d40719bd49ee201d9523e86a64d054b0c07ca
- dist/privacy.html: acfc4ec0e3facd62d69f6f6dfb484bbb0624da2df4be9fed04f1418ab0222416
- dist/support.html: 68519f478af0b66bcdf0856a187b92028985fdfe7f75735ade5b2257095c333a

## Executed checks
- PASS: changed-file allowlist; only the four listed deployment files changed.
- PASS: existing index/support form controls, required attributes, form identity and script references/inline scripts unchanged.
- PASS: deletion page local links and support.html#new-inquiry / #lookup targets resolve in packaged source.
- PASS: Korean content, app/operator, request methods, data categories, retention exceptions present.
- PASS: no 30-day or 90-day automatic-deletion guarantee in the four relevant pages.
- PASS: preview desktop rendering; request button navigated to the existing private inquiry form without login, input or submission.
- PASS: preview application section and its six required controls visible; no application submitted.
- PASS: browser-rendered 360/390/412 CSS-pixel iframe frames; document client/scroll widths 345/345, 375/375, 397/397 respectively (15px scrollbars); no horizontal overflow. This is responsive-layout QA, not physical-device or mobile-OS testing.
- PASS: native deployment succeeded and custom-domain SSL remains active.
- BLOCKED: production custom-domain GET from this execution environment returned HTTP 403, server envoy, body error code 1010, both before and after deployment. Search retrieval could not access the route; browser initial navigation failed. No CAPTCHA/security bypass, fingerprint change or network-path workaround was attempted.
- NOT VERIFIED: production HTTP 200, production PC/mobile rendering, live inquiry/application backend functionality. Deployment success and SSL metadata do not substitute for these checks.
- NOT RUN: customer submission, actual deletion, Supabase automatic deletion tests, administrator login, data mutation, paid API.

## Google Play / legal references
https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
The deletion resource must work, identify the app/developer and prominently offer a request pathway. Email or a form can be a pathway. Account-deletion and in-app requirements depend on actual account-creation functionality and are not certified by this web-only change.
https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=63460
Official Enforcement Decree Article 6 checked: contract/withdrawal 5 years, payment/supply 5 years, complaints/disputes 3 years, advertising 6 months. Existing privacy policy already includes the advertising period. These are conditional legal records, not blanket retention of all consultation data.

## GUARD checklist
| Requirement | Result |
|---|---|
| Production route / HTTPS HTTP 200 | BLOCKED, not claimed |
| SOLQ and operator shown | PASS in saved source and browser preview |
| Deletion request method | PASS in saved source and browser preview |
| Data categories | PASS |
| Retained categories and periods | PASS, conditional legal exceptions |
| Request page link | Preview PASS; production BLOCKED |
| Existing home/application preservation | Source/preview PASS; production regression BLOCKED |
| No false 30/90-day automatic deletion promise | PASS |
All-required-conditions decision: NO-GO until missing production checks are completed.

## Recovery
Version 29 remains saved and archive-backed with source 182ab212056ac89e3dcf4f08d37c7aa53ea47f47 and saved archive SHA-256 d53d8f496d96d111ee0ca90781bba7fb1bff29a2a88da115a752ca4492febd5d.
If a regression is confirmed, redeploy that exact saved version to the same project; do not change DB or DNS. Restoring 29 removes this new route and reverts these notice/link changes. No rollback executed; no service rollback test claimed.

## Safety / cost / next action
No Supabase read or write, customer-data mutation/deletion, operational setting change, key change, paid API, new server, payment, or unrelated deployment.
No GitHub main change. This report is on a dedicated evidence branch.
Additional purchased resources / paid calls: 0.
Next one Owner action: open https://solqtech.com/data-deletion.html in a normal PC/phone browser and confirm it loads the SOLQ deletion notice and its request link. If blocked there too, preserve the error and obtain hosting support guidance before any security-setting change. Do not submit Play as verified until public access is confirmed.
