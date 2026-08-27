# LeadGuard OS V6 — Razorpay Integration & Webhook Security

---

## 1. Cryptographic Signature Verification

### Checkout Payment Signature
When the client completes checkout, the server verifies the response using:
```ts
HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)
```
Using `crypto.timingSafeEqual` prevents timing-based side-channel attacks.

### Webhook Signature Verification
Incoming webhook deliveries at `POST /api/v1/webhooks/razorpay` require validation against the raw unmutated request body:
```ts
HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
```
Express captures `rawBody` during JSON parsing to ensure byte-exact signature verification.

---

## 2. Webhook Idempotency & Duplicate Protection

Every incoming Razorpay webhook delivery carries a unique `id` (e.g. `evt_...`).
1. **Idempotency Check**: The system queries `BillingEvent` for existing `providerEventId`.
2. **Duplicate Handling**: If the event has already been recorded, the server immediately returns `200 OK` with `{ duplicate: true }` without repeating any business effects.
3. **Transaction Safety**: New events and status transitions are recorded within atomic database transactions.
