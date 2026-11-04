# SOLQ first paid contract — funnel audit (2026-11-04)

Scope: read-only inspection of GitHub main index.html, app.js, admin.html, production-admin.js, plus existing marketing automation report. No customer records read or changed. No production deployment.

## Evidence
- main/index.html: NEXUS LABS brand, free trial CTA and application form, no explicit SOLQ 6-step free plan / 100,000 KRW starting price / 30,000 KRW deposit offer.
- main/app.js: submit_application RPC; receipt validation NX-YYYYMMDD-XXXXXXXX; redirects to preview.html by service after submission. This is free preview, not proof of a completed six-step plan, quotation, consent or deposit verification.
- main/admin.html: login and application list, human bank deposit verification instructions; production execution separate. Real browser authentication not validated in this audit.
- main/production-admin.js: admin job management and manual release action, but not evidence of production quote acceptance end-to-end.
- Marketing automation latest result: no non-test follow-up candidates, no unanswered inquiries, no new paid contract; WordPress cumulative 11 views/5 visitors, blog 7 views/5 visitors; source attribution and real site intake route not validated.
- Public solqtech.com content could not be independently fetched during this audit. Do not equate main branch with deployed Sites version 26.

## Recommended zero-spend conversion checks (no production mutation)
1. CORE: verify live solqtech.com mobile/desktop CTA, form, privacy/overseas transfer consents, receipt display and safe failure messaging with browser-only inspection; do not submit synthetic customer data without separate approval.
2. AUTO: compare actual free 6-step plan delivery, individual quote, consent, manual 30,000 KRW deposit confirmation, and distinct production authorization; flag any disconnected steps.
3. GROW: publish nothing until existing scheduled content is checked; propose single customer problem/solution offer with 100,000 KRW starting price and explicit basic-scope exclusions; use only actual verified examples.
4. FIN: track verified non-test leads, quotes sent, acceptances, deposits received and first completed contract; no invented sales.
5. GUARD: production remains NO-GO until required backup, restore, real admin auth and atomic persistence gates pass.

Status: AUDIT ONLY. No changes to main, customer data, Supabase configuration, paid services or advertising.
