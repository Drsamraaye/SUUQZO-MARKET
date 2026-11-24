# SUUQZO MALL — PHASE 07 PAYMENT WORKFLOWS
## End-to-End Payment Lifecycles Across All Supported Methods

---

## 1. Mobile Money via Aggregator (EVC Plus, ZAAD, eDahab, Premier Wallet)

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant API as Payments Controller
    participant Svc as Payments Service
    participant Provider as Aggregator Adapter
    participant Ext as Payment Aggregator
    participant WH as Webhook Receiver
    participant Ledger as Financial Ledger Service
    participant DB as PostgreSQL DB

    Customer->>API: POST /api/v1/payments (orderId, method, phone)
    API->>Svc: createPayment()
    Svc->>Provider: initializePayment()
    Provider-->>Svc: { paymentNumber, providerReference, status: PENDING }
    Svc->>DB: Save Payment & PaymentTransaction (PENDING)
    Svc->>DB: Update Order -> PAYMENT_PROCESSING
    Svc-->>Customer: Return payment details & provider reference

    Note over Customer,Ext: Customer approves USSD push on handset

    Ext->>WH: POST /api/v1/webhooks/payment (HMAC Signature header)
    WH->>Svc: processWebhookEvent()
    Svc->>Provider: verifyWebhook(signature, payload)
    Provider-->>Svc: Signature Valid, Status: CAPTURED
    Svc->>DB: Deduplicate via ProviderWebhookEvent (unique provider + eventId)
    
    rect rgb(240, 248, 255)
        Note over Svc,DB: Atomic Fulfillment & Ledger Posting
        Svc->>DB: Update Payment -> CAPTURED
        Svc->>DB: Update Order -> CONFIRMED
        Svc->>DB: Update SubOrders -> CONFIRMED
        Svc->>DB: Consume Inventory Reservations & Decrement Stock
        Svc->>Ledger: postTransaction(Debit 1010, Credit 2010-Seller, Credit 4010)
    end

    WH-->>Ext: 200 OK
```

---

## 2. Bank Transfer Payment Workflow

1. **Customer Request:** Customer selects `BANK_TRANSFER`.
2. **Instruction Generation:** System returns bank account numbers (Premier Bank, Dahabshiil Bank) and a unique payment reference `SQ-BT-XXXXXX`. Payment remains `PENDING`.
3. **Customer Transfer:** Customer transfers funds using external bank app or teller, citing `SQ-BT-XXXXXX` in transfer remarks.
4. **Admin Audit & Verification:** Finance admin inspects bank statement and executes `POST /api/v1/admin/payments/:id/verify-bank-transfer` with `bankReference`.
5. **Execution:**
   - Payment status becomes `CAPTURED`.
   - Order transitions to `CONFIRMED`.
   - Active inventory reservations transition to `CONSUMED`.
   - Ledger posts:
     - `Debit: 1020 Bank Transfer Settlement Account`
     - `Credit: 2010-{sellerId} Seller Payable`
     - `Credit: 4010 Marketplace Commission Revenue`

---

## 3. Cash on Delivery (COD) Workflow

1. **Customer Request:** Customer selects `CASH_ON_DELIVERY`. Payment status set to `PENDING`.
2. **Order Confirmation:** Order is confirmed for dispatch. Inventory is reserved.
3. **Physical Delivery:** Rider / courier delivers physical parcel to recipient.
4. **Cash Collection:** Recipient pays physical cash. Authorized delivery personnel / admin triggers `POST /api/v1/admin/payments/:id/confirm-cod`.
5. **Execution:**
   - Payment status becomes `CAPTURED`.
   - Ledger posts:
     - `Debit: 1030 Cash on Delivery Receivable`
     - `Credit: 2010-{sellerId} Seller Payable`
     - `Credit: 4010 Marketplace Commission Revenue`
