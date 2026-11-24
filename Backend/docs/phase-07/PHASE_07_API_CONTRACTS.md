# SUUQZO MALL — PHASE 07 API CONTRACTS
## Endpoint Specifications, Request DTOs & Response Envelopes

---

## 1. Customer Endpoints

### 1.1 Initiate Payment
- **Route:** `POST /api/v1/payments`
- **Auth:** `CUSTOMER`
- **Request Body:**
```json
{
  "orderId": "cuid-string",
  "paymentMethod": "EVC_PLUS",
  "payerPhone": "+252615555555",
  "idempotencyKey": "uuid-v4"
}
```
- **Response (201 Created):**
```json
{
  "payment": {
    "id": "cuid",
    "paymentNumber": "PAY-1732456789-ABC",
    "amount": "105.00",
    "status": "PENDING",
    "paymentMethod": "EVC_PLUS"
  },
  "actionRequired": true
}
```

### 1.2 Customer Payment History
- **Route:** `GET /api/v1/payments/mine`
- **Auth:** `CUSTOMER`
- **Query:** `page=1&limit=20&status=CAPTURED`

---

## 2. Webhook Endpoints

### 2.1 Centralized Payment Webhook
- **Route:** `POST /api/v1/webhooks/payment`
- **Auth:** `@Public()` (HMAC-SHA256 verified)
- **Headers:** `x-aggregator-signature: hex-digest`
- **Request Body:**
```json
{
  "eventId": "evt-12345",
  "providerReference": "AGG-67890",
  "providerTransactionId": "TXN-99999",
  "amount": "105.00",
  "status": "CAPTURED"
}
```

---

## 3. Admin & Finance Endpoints

- `GET /api/v1/admin/payments` — List payments (Paginated, filterable)
- `GET /api/v1/admin/payments/:id` — Payment audit inspection
- `POST /api/v1/admin/payments/:id/verify-bank-transfer` — Confirm bank transfer
- `POST /api/v1/admin/payments/:id/confirm-cod` — Confirm cash collection
- `POST /api/v1/admin/refunds` — Issue full/partial refund
- `GET /api/v1/admin/refunds` — List all refunds
- `GET /api/v1/admin/ledger/accounts` — Chart of accounts & live balances
- `GET /api/v1/admin/ledger/transactions` — Paginated double-entry transactions
- `POST /api/v1/admin/payouts/generate` — Generate daily payout batch
- `POST /api/v1/admin/payouts/:batchId/approve` — Approve and execute batch
- `GET /api/v1/admin/payouts` — List payout batches

---

## 4. Seller Finance Endpoints

- `GET /api/v1/seller/balance` — Check merchant balance (`currentBalance`, `availableBalance`, `reservedAmount`, `paidOutAmount`)
- `GET /api/v1/seller/payouts` — Paginated history of merchant payouts
