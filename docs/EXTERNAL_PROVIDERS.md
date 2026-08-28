# LeadGuard OS V6 — External Provider Integration Matrix

This document provides an honest, verifiable status matrix of all third-party and external service integrations in LeadGuard OS V6.

---

## 1. Provider Status Matrix

| External Service | Implementation Status | Repository Verification Mode | Production Prerequisites |
|---|:---:|:---:|---|
| **Razorpay (Billing & Subscriptions)** | `TEST / LIVE READY` | Tested via mock gateway & deterministic webhook verification suites (`tests/billing/*`). | Requires active `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and registered `RAZORPAY_WEBHOOK_SECRET` in live dashboard. |
| **AI Sales Pitch Generator** | `IMPLEMENTED` | Tested with `MOCK` provider (`AI_PROVIDER=MOCK`) and deterministic factual hallucination validators (`tests/agency/ai-pitch.test.ts`). | Requires external API key (e.g. OpenAI / Anthropic / Gemini) if switching `AI_PROVIDER=LIVE`. |
| **Email Dispatcher** | `IMPLEMENTED` | Tested via local `MOCK` dispatcher (`EMAIL_PROVIDER=MOCK`). | Requires production SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) or transactional email gateway (SendGrid/Postmark/SES). |
| **Asset & PDF Report Storage** | `IMPLEMENTED` | `LOCAL` file storage fully verified in test suites. `S3` object storage provider interface implemented in `apps/worker/src/report/pdfWorker.ts`. | Requires AWS S3 / Cloudflare R2 bucket (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) when `REPORT_STORAGE=S3`. |
| **Outbound Webhook Dispatcher** | `PRODUCTION VERIFIED` | Fully verified in integration and security test suites with HMAC-SHA256 signatures, replay window checks, and manual redirect hop SSRF filtering (`tests/security/webhook-ssrf.test.ts`). | Requires reachable external customer webhook endpoints. |

---

## 2. Environment Verification Flags

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`: If unset or in development, billing falls back safely without breaking application initialization.
- `AI_PROVIDER`: Defaults to `MOCK` for local development and CI testing.
- `REPORT_STORAGE`: Defaults to `LOCAL` (`uploads/reports/`), preserving full report generation without external cloud dependencies.
