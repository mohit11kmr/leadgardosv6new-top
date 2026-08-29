---
name: leadguard-no-fake-data
description: Absolute prohibition against fabricated product data, invented metrics, fake social proof, and hallucinatory stats. Use whenever authoring UI views, documentation, or marketing copy.
---

# LeadGuard OS V6 — Zero Fake Data Policy

LeadGuard OS V6 is an authoritative diagnostic and intelligence platform built on empirical trust. Fabricating metrics, statistics, customer numbers, or mock claims destroys platform credibility and is strictly forbidden.

## Explicitly Prohibited Fabrications

Developers and AI agents must NEVER invent or hardcode:

- ❌ **Fabricated Customer Counts**: (e.g., "Trusted by 10,000+ top enterprises", "Over 500k audits completed").
- ❌ **Fabricated Revenue Numbers**: (e.g., "$12.4M Recovered Revenue Across All Clients").
- ❌ **Fabricated Opportunity Loss Stats**: Inventing aggregate global loss stats without underlying scan data.
- ❌ **Fake Active Monitoring Metrics**: (e.g., "1,248 sites actively protected right now").
- ❌ **Fabricated Findings & Security Flaws**: Inventing fake security vulnerability names, fictitious CVEs, or mock scan errors.
- ❌ **Fabricated Testimonials & Social Proof**: Mock company logos, fictitious client quotes, fake review scores (e.g., "5.0 on G2 by 400+ users").
- ❌ **Fabricated System Health Scores**: Hardcoded "Score: 98/100" where live API data is expected.

---

## Allowed Data Sources & Formats

The only permissible sources of data in LeadGuard OS V6 are:

1. **Real API / Database Records**:
   - Telemetry, audit findings, metrics, and logs returned by live backend endpoints.
2. **Explicitly Labeled Demo Fixtures**:
   - For offline testing, onboarding previews, or sales demos, fixtures MUST be clearly demarcated in the UI (e.g., `[Sample Preview Mode]`, `[Demo Audit Data]`, `[Example Site]`).
3. **Explicitly Labeled Static Examples**:
   - Where illustrative examples are needed (e.g., documentation or guide cards), clearly label them as "Example Scenario" or "Illustration".
4. **Verified Mathematical Estimates**:
   - Revenue and opportunity loss projections derived from formulaic models MUST be explicitly marked with an "Estimated Impact" disclaimer detailing assumptions (traffic × conversion rate × lead value).
