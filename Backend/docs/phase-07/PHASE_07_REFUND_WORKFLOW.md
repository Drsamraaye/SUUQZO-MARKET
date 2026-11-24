# SUUQZO MALL — PHASE 07 REFUND WORKFLOW
## Full and Partial Customer Refunds with Ledger Reversals

---

## 1. Refund Rules and Validation

1. **Eligible Payment Status:** Only payments with status `CAPTURED` or `PARTIALLY_REFUNDED` can be refunded.
2. **Remaining Refundable Verification:**
   $$\text{Remaining Refundable} = \text{Payment Amount} - \sum (\text{Existing Completed Refunds})$$
   Refund requests specifying an amount greater than the remaining refundable balance are rejected with `BadRequestException`.
3. **SubOrder Targeting:** Refunds can target a specific `SubOrder` or the entire parent `Order`.
4. **Proportional Revenue Reversal:**
   $$\text{Commission Reversal} = \text{Refund Amount} \times \text{Commission Rate}$$
   $$\text{Seller Debit} = \text{Refund Amount} - \text{Commission Reversal}$$
5. **Ledger Balancing:**
   - **Debit:** `4010 Commission Revenue` ($1.00)
   - **Debit:** `2010-{sellerId} Seller Payable` ($19.00)
   - **Credit:** `1010 Cash Clearing` ($20.00)
   - *Total Debits === Total Credits.*
6. **Status Transitions:**
   - If cumulative refunds equal total payment amount:
     - `Payment.status` -> `REFUNDED`
     - `Order.status` -> `REFUNDED`
   - If partial:
     - `Payment.status` -> `PARTIALLY_REFUNDED`
