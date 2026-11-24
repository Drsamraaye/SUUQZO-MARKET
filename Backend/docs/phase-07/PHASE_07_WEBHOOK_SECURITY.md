# SUUQZO MALL — PHASE 07 WEBHOOK SECURITY
## Cryptographic HMAC Verification, Replay Attack Prevention & Idempotency

---

## 1. Webhook Authentication Architecture

Webhooks sent to `/api/v1/webhooks/payment` are unauthenticated from a JWT perspective (`@Public()`), but cryptographically authenticated via **HMAC-SHA256 signatures**.

```
Expected Signature = HMAC_SHA256(Raw_JSON_Payload, Webhook_Secret)
Received Signature = Header['x-aggregator-signature']
```

### Security Defenses Implemented:
1. **Timing-Safe Equality:** Signatures are compared using `crypto.timingSafeEqual(sigBuf, expBuf)` to eliminate side-channel timing attack vulnerabilities.
2. **Rejection of Unsigned Requests:** Requests omitting the signature header are immediately rejected with `400 Bad Request`.
3. **Rejection of Tampered Payloads:** Any modification to amount, status, or reference invalidates the digest and causes immediate rejection.
4. **No Secret Leakage:** The webhook secret is strictly maintained server-side and never exposed in responses or audit logs.

---

## 2. Event Deduplication & Replay Protection

To prevent double-capturing or double-crediting balances from duplicate webhook deliveries:

1. **Unique Constraint:** The PostgreSQL model `ProviderWebhookEvent` enforces `@@unique([provider, eventId])`.
2. **Idempotency Guard:**
   - When a webhook arrives, the system queries for existing `[provider, eventId]`.
   - If found and `status === PROCESSED`, the handler immediately exits with `{ isIdempotent: true }` without executing balance updates.
   - If payment is already in `CAPTURED` status, subsequent webhooks are acknowledged without duplicate ledger entries.
