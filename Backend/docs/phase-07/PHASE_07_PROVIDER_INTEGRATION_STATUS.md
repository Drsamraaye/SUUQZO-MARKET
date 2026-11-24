# SUUQZO MALL — PHASE 07 PROVIDER INTEGRATION STATUS
## Production Readiness, Environment Variables & Credentials State

**Status:** IMPLEMENTED — PROVIDER CREDENTIALS PENDING  

---

## 1. Provider Adapter Status Matrix

| Payment Method | Adapter | Provider Type | Sandbox Simulation | Live Credentials State | Webhook Support |
|---|---|---|---|---|---|
| **EVC Plus** | `AggregatorPaymentAdapter` | Centralized Aggregator | Verified & Tested | PENDING | HMAC-SHA256 |
| **ZAAD** | `AggregatorPaymentAdapter` | Centralized Aggregator | Verified & Tested | PENDING | HMAC-SHA256 |
| **eDahab** | `AggregatorPaymentAdapter` | Centralized Aggregator | Verified & Tested | PENDING | HMAC-SHA256 |
| **Premier Wallet** | `AggregatorPaymentAdapter` | Centralized Aggregator | Verified & Tested | PENDING | HMAC-SHA256 |
| **Bank Transfer** | `BankTransferPaymentAdapter` | Manual Financial Settlement | Verified & Tested | Ready (Direct Bank Account) | Manual Audit |
| **Cash on Delivery** | `CashOnDeliveryPaymentAdapter`| Physical Courier Settlement| Verified & Tested | Ready (Operational Cash) | Delivery Confirmation |

---

## 2. Configuration & Secrets (`Backend/.env`)

The following environment variables have been established:

```env
# Centralized Payment Aggregator
PAYMENT_AGGREGATOR_BASE_URL=https://api.aggregator-sandbox.suuqzo.test
PAYMENT_AGGREGATOR_API_KEY=suuqzo-sandbox-api-key-placeholder
PAYMENT_AGGREGATOR_MERCHANT_ID=SUUQZO_MERCHANT_001
PAYMENT_AGGREGATOR_WEBHOOK_SECRET=suuqzo-default-webhook-secret-key-32b
PAYMENT_RESERVATION_TTL_MINUTES=30
```

> [!NOTE]
> When external merchant keys are issued by the payment aggregator partner (e.g. Hormuud Waafi / Dahabshiil / Telesom), populate the respective variables in `Backend/.env`. The adapter is designed to switch seamlessly to live outbound HTTP dispatch without requiring architectural or schema changes.
