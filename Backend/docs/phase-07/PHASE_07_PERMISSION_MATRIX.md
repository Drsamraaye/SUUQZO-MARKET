# SUUQZO MALL — PHASE 07 PERMISSION MATRIX
## Role-Based Access Control & Permission Enforcement

---

| Endpoint | Method | Role Allowed | Required Permission | IDOR Protection |
|---|---|---|---|---|
| `/api/v1/payments` | POST | `CUSTOMER` | — | Customer owns Order |
| `/api/v1/payments/mine` | GET | `CUSTOMER` | — | Filtered by Customer ID |
| `/api/v1/payments/:id` | GET | `CUSTOMER`, `SELLER`, `ADMIN` | — | Customer owns / Seller owns suborder |
| `/api/v1/webhooks/payment` | POST | `@Public()` | — | HMAC-SHA256 signature verification |
| `/api/v1/admin/payments` | GET | `ADMIN`, `SUPER_ADMIN` | `admin.payments.view` | — |
| `/api/v1/admin/payments/:id` | GET | `ADMIN`, `SUPER_ADMIN` | `admin.payments.view` | — |
| `/api/v1/admin/payments/:id/verify-bank-transfer` | POST | `ADMIN`, `SUPER_ADMIN` | `admin.payments.manage` | Audit logged |
| `/api/v1/admin/payments/:id/confirm-cod` | POST | `ADMIN`, `SUPER_ADMIN` | `admin.payments.manage` | Audit logged |
| `/api/v1/admin/refunds` | POST | `ADMIN`, `SUPER_ADMIN` | `admin.orders.refund` | Audit logged |
| `/api/v1/admin/refunds` | GET | `ADMIN`, `SUPER_ADMIN` | `admin.payments.view` | — |
| `/api/v1/admin/ledger/accounts` | GET | `ADMIN`, `SUPER_ADMIN` | `admin.payments.view` | — |
| `/api/v1/admin/ledger/transactions` | GET | `ADMIN`, `SUPER_ADMIN` | `admin.payments.view` | — |
| `/api/v1/admin/payouts/generate` | POST | `ADMIN`, `SUPER_ADMIN` | `admin.payouts.approve` | Audit logged |
| `/api/v1/admin/payouts/:batchId/approve` | POST | `ADMIN`, `SUPER_ADMIN` | `admin.payouts.approve` | Audit logged |
| `/api/v1/admin/payouts` | GET | `ADMIN`, `SUPER_ADMIN` | `admin.payouts.view` | — |
| `/api/v1/seller/balance` | GET | `SELLER` | — | Strict user seller profile |
| `/api/v1/seller/payouts` | GET | `SELLER` | — | Strict user seller profile |
