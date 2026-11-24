# SUUQZO MALL — PHASE 07 COMMISSION & SELLER BALANCES
## Platform Commission Calculation, Snapshotting & Balance Aggregations

---

## 1. 5% Marketplace Commission Policy

- **Fixed Commission Rate:** 5% (`0.0500`) applied to merchandise items subtotal.
- **Delivery & Service Fees:** Delivery fees are excluded from commission calculations and passed through according to operational agreements.
- **Snapshot Integrity:** Commission rate and commission amount are calculated and snapshotted at checkout on each `SubOrder` and `OrderItem` in Phase 06 and immutable thereafter.

---

## 2. Live Seller Balance Computation

`FinancialLedgerService.getSellerBalance(sellerId)` computes live financial positions:

1. **`currentBalance`:** Live balance of liability account `2010-{sellerId}` in PostgreSQL.
2. **`reservedAmount`:** Sum of scheduled seller payouts currently in `SCHEDULED` or `PROCESSING` status.
3. **`availableBalance`:** 
   $$\text{availableBalance} = \max(0, \text{currentBalance} - \text{reservedAmount})$$
4. **`paidOutAmount`:** Cumulative sum of all historical payouts with status `PAID`.

### Seller Isolation:
Merchants can only query their own balance via `GET /api/v1/seller/balance`. Querying another merchant's account is strictly rejected with `ForbiddenException`.
