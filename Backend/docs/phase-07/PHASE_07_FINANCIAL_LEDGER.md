# SUUQZO MALL — PHASE 07 FINANCIAL LEDGER
## Immutable Double-Entry Ledger, Chart of Accounts & Balancing Rules

---

## 1. System Chart of Accounts

| Account Code | Account Name | Account Type | Normal Balance | Purpose |
|---|---|---|---|---|
| **1010** | Cash & Aggregator Clearing | `ASSET` | Debit | Clearing account for digital payments received (EVC, ZAAD, etc.) |
| **1020** | Bank Transfer Settlement | `ASSET` | Debit | Settlement account for verified direct bank transfers |
| **1030** | Cash on Delivery Receivable | `ASSET` | Debit | Tracking physical cash collected upon delivery |
| **2010** | Seller Payable Control | `LIABILITY` | Credit | Master control account for merchant payables |
| **2010-{sellerId}** | Seller Payable - Merchant | `LIABILITY` | Credit | Individual seller liability sub-account |
| **4010** | Marketplace 5% Commission | `REVENUE` | Credit | SUUQZO marketplace net earned commission |
| **5010** | Customer Refund Reversal | `EXPENSE` | Debit | Refund expense / contra account |

---

## 2. Double-Entry Verification Rules

Every financial transaction posted via `FinancialLedgerService.postTransaction()` is validated before persistence:

$$\sum \text{Debits} = \sum \text{Credits}$$

If $\text{Total Debits} \neq \text{Total Credits}$, the service immediately throws `BadRequestException` and aborts the database transaction.

### Account Type Balance Dynamics:
- **Assets (`1010`, `1020`, `1030`) & Expenses (`5010`):**
  $$\Delta \text{Balance} = +\text{Debit} - \text{Credit}$$
- **Liabilities (`2010-{sellerId}`) & Revenues (`4010`):**
  $$\Delta \text{Balance} = +\text{Credit} - \text{Debit}$$

---

## 3. Standard Transaction Templates

### 3.1 Order Payment Capture ($100 GMV, 5% Commission)
- **Debit:** `1010 Cash Clearing Account` — **$100.00**
- **Credit:** `2010-{sellerId} Seller Payable` — **$95.00**
- **Credit:** `4010 Commission Revenue` — **$5.00**
*(Total Debit $100.00 === Total Credit $100.00)*

### 3.2 Daily Payout Execution to Seller ($95.00)
- **Debit:** `2010-{sellerId} Seller Payable` — **$95.00** (Decreases seller liability)
- **Credit:** `1010 Cash Clearing Account` — **$95.00** (Decreases cash asset)
*(Total Debit $95.00 === Total Credit $95.00)*

### 3.3 Partial Customer Refund ($20.00)
- **Debit:** `4010 Commission Revenue` — **$1.00** (Reverses 5% commission)
- **Debit:** `2010-{sellerId} Seller Payable` — **$19.00** (Reverses seller earnings)
- **Credit:** `1010 Cash Clearing Account` — **$20.00** (Reduces cash)
*(Total Debit $20.00 === Total Credit $20.00)*
