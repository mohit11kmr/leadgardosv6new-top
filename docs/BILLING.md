# LeadGuard OS V6 — Monetization & Billing Platform

LeadGuard OS V6 features a self-hosted commercial billing and subscription platform powered by a pluggable payment provider architecture with Razorpay integration.

---

## 1. Commercial Product Catalogue

### Subscription Plans

| Tier | Code | Price (INR) | Audits / Mo | Monitored Sites | Real-Time Monitoring | API Keys | White-label Reports |
|---|---|---|---|---|:---:|:---:|:---:|
| **Starter** | `FREE` | ₹0 / mo | 3 | 1 | ❌ | ❌ | ❌ |
| **Pro** | `PRO` | ₹4,999 / mo | 50 | 5 | ✅ | ✅ | ❌ |
| **Agency** | `AGENCY` | ₹14,999 / mo | 500 | 50 | ✅ | ✅ | ✅ |
| **Enterprise** | `ENTERPRISE` | Custom | Unlimited | Unlimited | ✅ | ✅ | ✅ |

### Diagnostic Add-ons & One-Time Solutions

- **Express Fix (₹2,999 one-time)**: High-priority engineer-assisted remediation for conversion leakages and critical diagnostic findings.
- **Watchdog 24/7 (₹299 / month)**: Continuous 5-minute uptime, form submission, and conversion leakage watchdog monitoring.

---

## 2. Architecture & Payment Flow

```
React Web App                      Express API                     Razorpay / Webhooks
      │                                 │                                   │
      │── POST /billing/checkout/ef ───>│                                   │
      │                                 │── Create Order (HMAC) ───────────>│
      │<─ { orderId, amount, keyId } ───│                                   │
      │                                 │                                   │
      │── Razorpay Modal Checkout ─────────────────────────────────────────>│
      │<─ { orderId, paymentId, sig } ──────────────────────────────────────│
      │                                 │                                   │
      │── POST /billing/verify ────────>│                                   │
      │   (orderId, paymentId, sig)     │── Server-Side HMAC Verification ──│
      │                                 │── Deduplicate & Store Payment ───>│
      │                                 │── Generate Invoice (PDF/GST) ────>│
      │<─ { payment, invoice } ─────────│                                   │
```

---

## 3. Financial Data Integrity & Currency Rules

1. **Smallest Unit Precision**: All prices and money values are stored as integers in **paise** (1 INR = 100 paise) to prevent IEEE 754 floating-point inaccuracies.
2. **Server-Side Verification**: Client payment success events are never trusted. All payments require cryptographic signature verification or webhook confirmation.
3. **Idempotency**: All webhook events and payment IDs are tracked and deduplicated via unique database constraints.
