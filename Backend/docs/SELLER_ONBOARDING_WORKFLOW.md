# SUUQZO MALL — SELLER ONBOARDING & KYC WORKFLOW
## Phase 04 Technical Specification

### 1. Workflow Architecture & State Machine

The seller onboarding lifecycle transitions an ordinary marketplace customer into a verified vendor authorized to operate stores and list catalog inventory.

```
       [ Customer Account ]
                │
                ▼ POST /api/v1/sellers/apply
      [ PENDING_REVIEW ] ◄──────────────────────────────┐
                │                                       │
                ├───────────► POST /kyc-documents       │ Re-apply / Update
                │             (License, ID, Tax Cert)   │
                ▼                                       │
      [ Admin Application Review ]                      │
                │                                       │
        ┌───────┴───────────────┐                       │
        │                       │                       │
        ▼ (APPROVE)             ▼ (REJECT)              │
  [ VERIFIED ]            [ REJECTED ] ─────────────────┘
        │                       ▲
        │ (Breach/Audit)        │
        ▼                       │
  [ SUSPENDED ] ────────────────┘
```

---

### 2. Detailed Workflow Steps

#### 2.1 Step 1 — Application Submission
- **Endpoint**: `POST /api/v1/sellers/apply`
- **Caller**: Authenticated user (CUSTOMER or newly registered user).
- **Payload**:
  ```json
  {
    "businessName": "Hodan Supermarket & Imports",
    "legalName": "Hodan General Trading LLC",
    "taxId": "SO-TIN-889901",
    "businessRegistrationNo": "MOG-REG-2026-441",
    "defaultPayoutMethod": "EVC_PLUS",
    "payoutAccountIdentifier": "+252615000000",
    "payoutAccountDetails": { "bankName": "Premier Bank", "accountNumber": "12345678" }
  }
  ```
- **Operations**:
  - Validates that user does not already have a `VERIFIED` seller profile.
  - Upserts `SellerProfile` in `PENDING_REVIEW` state.
  - Emits `SELLER_APPLICATION_SUBMITTED` audit log.
  - Sends acknowledgement notification to applicant.

#### 2.2 Step 2 — KYC Document Ingestion
- **Endpoint**: `POST /api/v1/sellers/kyc-documents`
- **Supported Documents**:
  - `COMMERCIAL_LICENSE`: Municipal trade license.
  - `NATIONAL_ID` / `PASSPORT`: Identity proof of business owner.
  - `TAX_CERTIFICATE`: Ministry of Finance tax registration document.
- **Operations**:
  - Verifies presence of a valid seller application.
  - Persists `SellerKycDocument` with `status: "PENDING"`.
  - Emits `SELLER_KYC_DOCUMENT_UPLOADED` audit log.

#### 2.3 Step 3 — Administrative Review & Adjudication
- **Endpoint**: `PATCH /api/v1/sellers/applications/:id/review`
- **Guards**: `@Roles(ADMIN, SUPER_ADMIN)`, `@RequirePermissions('admin.sellers.approve')`
- **Payload**:
  ```json
  {
    "decision": "APPROVE",
    "commissionRate": 0.045,
    "reason": "All commercial credentials and tax clearance verified."
  }
  ```

---

### 3. Critical Security Protections

#### 3.1 Anti-Conflict of Interest (Self-Approval Prevention)
- **Constraint**: Administrators cannot approve, reject, or adjudicate their own seller applications.
- **Enforcement**:
  ```typescript
  if (seller.userId === adminId) {
    throw new ForbiddenException(
      'Administrators cannot review or approve their own seller applications.',
    );
  }
  ```
- **Audit**: Attempts are blocked and can trigger platform security alerts.

#### 3.2 Transactional Role Elevation
Seller approval executes within an atomic Prisma database transaction:
1. `SellerProfile.verificationStatus` is updated to `VERIFIED`.
2. Commission rate is customized if specified in review payload.
3. `User.assignedRoles` atomically appends `SELLER`.
4. If primary role was `CUSTOMER`, it is promoted to `SELLER`.
5. An audit log and notification are recorded within the same transaction.

#### 3.3 Document Privacy & Multi-Tenant Isolation
- KYC identity proofs and commercial registrations are sensitive legal assets.
- **Endpoint**: `GET /api/v1/sellers/:id/documents`
- **Access Rule**: Only the owner seller (`seller.userId === actorId`) or authorized administrators (`ADMIN`, `SUPER_ADMIN` with `admin.sellers.view`) can read document URLs. All other users receive `HTTP 403 Forbidden`.
