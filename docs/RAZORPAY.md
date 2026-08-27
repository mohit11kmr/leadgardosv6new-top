# LeadGuard OS V6 — Razorpay Integration & Webhook Security

---

## 1. Provider Operation Modes

The LeadGuard Razorpay provider operates under three explicit modes configured via `PAYMENT_PROVIDER_MODE`:

| Mode | Purpose | Provider Behavior | Credential Requirement |
|---|---|---|---|
| `MOCK` | Unit testing & offline CI | Generates deterministic mock IDs (`order_mock_*`, `sub_mock_*`) without network calls. | None (Uses mock secrets). |
| `TEST` | Sandbox integration testing | Executes live HTTPS REST requests against Razorpay Sandbox (`https://api.razorpay.com/v1/*`). | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| `LIVE` | Production transactions | Executes live HTTPS REST requests against Razorpay Production. | Production credentials required; fails startup if missing. |

> [!IMPORTANT]
> The system **never** silently falls back from `TEST` or `LIVE` to `MOCK`. Missing credentials in `TEST`/`LIVE` mode throw explicit fatal configuration errors.

---

## 2. Server-Side REST API Operations

In `TEST` and `LIVE` modes, the backend makes real HTTP Basic-authenticated calls to Razorpay:

1. **Order Creation**: `POST https://api.razorpay.com/v1/orders`
   - Payload: `{ amount, currency, receipt, notes }`
2. **Subscription Creation**: `POST https://api.razorpay.com/v1/subscriptions`
   - Payload: `{ plan_id, total_count, customer_notify, notes }`
3. **Subscription Cancellation**: `POST https://api.razorpay.com/v1/subscriptions/{id}/cancel`
   - Payload: `{ cancel_at_cycle_end: 1 }`

---

## 3. Cryptographic Signature Verification

### Checkout Payment Signature
When the client completes checkout, the server verifies the response using:
```ts
HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)
```
Using `crypto.timingSafeEqual` prevents timing-based side-channel attacks.

### Webhook Signature Verification
Incoming webhook deliveries at `POST /api/v1/webhooks/razorpay` require validation against the exact unmutated raw HTTP request bytes:
```ts
HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
```
Express captures `rawBody` before JSON parsing. If `rawBody` is unavailable, the server rejects the request with `500 RAW_BODY_UNAVAILABLE`. Reconstructing payloads via `JSON.stringify(req.body)` is strictly forbidden.

---

## 4. Webhook Idempotency & Duplicate Protection

Every incoming Razorpay webhook delivery carries a unique `id` (e.g. `evt_...`).
1. **Idempotency Check**: The system queries `BillingEvent` for existing `providerEventId`.
2. **Duplicate Handling**: If the event has already been recorded, the server immediately returns `200 OK` with `{ duplicate: true }` without repeating any business effects.
3. **Transaction Safety**: New events and status transitions are recorded within atomic database transactions.
