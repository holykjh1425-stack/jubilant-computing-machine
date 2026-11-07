# SOLQ revenue growth execution plan — 2026-11-02

Status: strategy and task plan, not achieved revenue or autonomous worker deployment.

## North star
User aspiration: KRW 1 billion net profit within one year across SOLQ and complementary businesses. This is an ambitious scenario, not a forecast or promise. Prioritize verified customer value, cash collection, gross margin, and legal compliance.

## 30-day operating priorities
1. **Protect and finish the core funnel** (DEVELOPMENT + SECURITY_QA). Complete production-equivalent encrypted backup/isolated restore and real admin auth before production deployment. Preserve 63 existing isolated PASS and do not rerun them.
2. **Convert the first paying customer** (MARKETING + FINANCE). Audit existing inquiry funnel without exposing personal data; publish useful small-business workflow examples; measure inquiries, qualified leads, free-plan delivery, quotes, deposits, paid approvals, completions. Never count test applications as sales.
3. **Productize the 100,000 KRW entry offer** (BUSINESS + AI_AUTOMATION). Define scope, turnaround, exclusions, support, acceptance criteria and cost-to-serve. Deposit 30,000 KRW, balance 70,000 KRW, optional maintenance, and separate production approval remain mandatory.
4. **Build an education-to-service flywheel** (BUSINESS + MARKETING). Research legal requirements for online lifelong education, prototype a free short course and paid training offering only after compliance and demand validation. Link training to optional SOLQ service consultation; do not assume accreditation or register a school.
5. **Measure economics** (FINANCE). Track verified revenue, variable AI/hosting costs, time spent, refund/maintenance liabilities, net contribution and monthly cash burn. Use scenarios rather than fictitious numbers.
6. **Experiment with low-cost lead generation** (MARKETING). Compare helpful Naver/WordPress articles, short videos and referral outreach with tagged links; no paid advertising without approval. Mark hypothetical cases clearly.

## Creative experiments with measurable stop/go gates
- **Automation health check**: a free 6-step workflow diagnosis that produces a bounded estimate and next-action list. Success metric: qualified inquiries per completed diagnosis.
- **Industry mini-packs**: repeatable templates for appointment intake, inquiry classification, quote follow-up, with clearly excluded paid integrations. Success metric: time to deliver and gross margin per pack.
- **Training-to-implementation**: a short AI workflow class followed by an optional, separately contracted implementation. Success metric: qualified leads and paid conversion, not just views.
- **Referral partner pilots**: test introductions from local business associations or professional service providers without kickbacks or unapproved contracts. Success metric: attributable qualified leads.
- **Recurring care plan**: optional monitoring and change requests after delivery, with explicit scope and service level. Success metric: retention and contribution margin.

## Weekly scorecard (zero means measured zero; unknown remains unknown)
- Unique qualified inquiries
- Free plans delivered (real/test separated)
- Quotes accepted
- Deposits actually confirmed
- Projects completed after separate approval
- Cash received, refunds, direct costs, gross contribution
- Recurring maintenance customers and churn
- Customer acquisition channel and cost
- Blockers and safety incidents

## Execution governance
- Read WORK_LEDGER.md, tasks.json, COORDINATION_POLICY.md, WORKER_ROLES.md before work.
- Each cross-functional task has one accountable owner; reviewers are read-only until handed off.
- Use atomic claims and idempotency keys before enabling unattended writes; currently not implemented.
- No production DB changes, main merge, deployment, paid API usage, card charge, contract or business registration without applicable approvals.
- Supabase Pro conditionally authorized only if official support confirms backup/isolated restore viability; verify total monthly amount and seek approval if above USD 25.
- Never claim a Work session auto-resumed or a payment occurred without evidence.

## Immediate next verified technical milestone
Manually dispatch the credential-free GitHub Actions smoke test for the candidate branch if available; record run URL and PASS. Then implement and test atomic ledger claims and safe dispatch bridge before enabling any recurring execution.
