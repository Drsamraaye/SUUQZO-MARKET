# SUUQZO MALL — PHASE 04 API CONTRACTS
## User Management, Seller Onboarding & Store Management

All endpoints are hosted under `/api/v1/`. Protected endpoints require standard `Authorization: Bearer <access_token>` headers.

---

### 1. User Management Endpoints

#### 1.1 `GET /api/v1/users`
- **Access**: `ADMIN`, `SUPER_ADMIN` (Permission: `admin.users.view`)
- **Query Parameters**:
  - `page` (number, default: 1)
  - `limit` (number, default: 20, max: 100)
  - `search` (string, searches phone, email, customer name, seller business name)
  - `role` (`CUSTOMER` | `SELLER` | `ADMIN` | `SUPER_ADMIN`)
  - `status` (`PENDING_VERIFICATION` | `ACTIVE` | `SUSPENDED` | `BANNED` | `DEACTIVATED`)
- **Success Response (200 OK)**:
  ```json
  {
    "items": [
      {
        "id": "cm4abc1230001xyz",
        "phone": "+252615112233",
        "email": "customer@suuqzo.test",
        "role": "CUSTOMER",
        "status": "ACTIVE",
        "assignedRoles": ["CUSTOMER"],
        "isPhoneVerified": true,
        "isEmailVerified": false,
        "createdAt": "2026-11-20T10:00:00.000Z",
        "customerProfile": {
          "firstName": "Hassan",
          "lastName": "Ali",
          "avatarUrl": null
        },
        "sellerProfile": null
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
  ```

#### 1.2 `GET /api/v1/users/:id`
- **Access**: Self User or `ADMIN` / `SUPER_ADMIN`
- **Success Response (200 OK)**:
  Safe profile projection excluding password hashes and two-factor secrets. Includes attached customer, seller, rider, and admin profiles.

#### 1.3 `PATCH /api/v1/users/:id`
- **Access**: Self User or `ADMIN` / `SUPER_ADMIN`
- **Request Body**:
  ```json
  {
    "firstName": "Hassan",
    "lastName": "Ali-Updated",
    "email": "new.email@suuqzo.test",
    "avatarUrl": "https://storage.suuqzo.test/avatars/user1.png",
    "preferredLanguage": "so",
    "preferredCurrency": "USD"
  }
  ```
- **Success Response (200 OK)**: Returns updated user and customer profile.

#### 1.4 `PATCH /api/v1/users/:id/status`
- **Access**: `ADMIN`, `SUPER_ADMIN` (Permission: `admin.users.suspend`)
- **Request Body**:
  ```json
  {
    "status": "SUSPENDED",
    "reason": "Repeated policy violation and suspicious chargeback activity."
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "userId": "cm4abc1230001xyz",
    "previousStatus": "ACTIVE",
    "newStatus": "SUSPENDED",
    "reason": "Repeated policy violation and suspicious chargeback activity."
  }
  ```

#### 1.5 `POST /api/v1/users/:id/roles`
- **Access**: Strictly `SUPER_ADMIN` (Permission: `admin.users.roles`)
- **Request Body**:
  ```json
  {
    "role": "ADMIN",
    "action": "ADD"
  }
  ```
- **Success Response (200 OK)**: Returns updated user record with updated `assignedRoles`.

#### 1.6 `GET /api/v1/users/:id/audit`
- **Access**: Self User or `ADMIN` / `SUPER_ADMIN`
- **Success Response (200 OK)**: Array of `AuditLog` records for the user.

---

### 2. Seller Onboarding Endpoints

#### 2.1 `POST /api/v1/sellers/apply`
- **Access**: Authenticated User
- **Request Body**:
  ```json
  {
    "businessName": "Bakaara Tech Solutions",
    "legalName": "Bakaara Tech LLC",
    "taxId": "SO-TAX-102938",
    "businessRegistrationNo": "MOG-BR-5544",
    "defaultPayoutMethod": "EVC_PLUS",
    "payoutAccountIdentifier": "+252615998877",
    "payoutAccountDetails": { "provider": "Hormuud", "branch": "Bakaara" }
  }
  ```
- **Success Response (201 Created)**: Returns created `SellerProfile` in `PENDING_REVIEW` status.

#### 2.2 `GET /api/v1/sellers/me`
- **Access**: Authenticated User
- **Success Response (200 OK)**: Returns caller's `SellerProfile`, KYC documents, and stores.

#### 2.3 `POST /api/v1/sellers/kyc-documents`
- **Access**: Authenticated User with Seller Application
- **Request Body**:
  ```json
  {
    "documentType": "COMMERCIAL_LICENSE",
    "documentUrl": "https://storage.suuqzo.test/kyc/license.pdf"
  }
  ```
- **Success Response (201 Created)**: Returns created `SellerKycDocument` in `PENDING` status.

#### 2.4 `GET /api/v1/sellers/applications`
- **Access**: `ADMIN`, `SUPER_ADMIN` (Permission: `admin.sellers.view`)
- **Query Parameters**: `page`, `limit`, `status`, `search`
- **Success Response (200 OK)**: Paginated array of seller applications with KYC documents.

#### 2.5 `PATCH /api/v1/sellers/applications/:id/review`
- **Access**: `ADMIN`, `SUPER_ADMIN` (Permission: `admin.sellers.approve`)
- **Self-Approval**: Blocked (`HTTP 403 Forbidden` if `seller.userId === admin.id`).
- **Request Body**:
  ```json
  {
    "decision": "APPROVE",
    "commissionRate": 0.05,
    "reason": "Business registration and commercial license verified."
  }
  ```
- **Success Response (200 OK)**: Returns updated `SellerProfile` in `VERIFIED` status.

#### 2.6 `PATCH /api/v1/sellers/kyc-documents/:id/review`
- **Access**: `ADMIN`, `SUPER_ADMIN` (Permission: `admin.sellers.review`)
- **Request Body**:
  ```json
  {
    "status": "APPROVED",
    "rejectionReason": null
  }
  ```
- **Success Response (200 OK)**: Returns updated `SellerKycDocument`.

#### 2.7 `GET /api/v1/sellers/:id/documents`
- **Access**: Owner Seller or `ADMIN` / `SUPER_ADMIN`
- **Success Response (200 OK)**: Array of `SellerKycDocument` objects.

---

### 3. Store Management Endpoints

#### 3.1 `GET /api/v1/stores`
- **Access**: Public (`@Public()`)
- **Query Parameters**: `page`, `limit`, `city`, `isFeatured`, `search`
- **Success Response (200 OK)**: Paginated array of `ACTIVE` stores.

#### 3.2 `GET /api/v1/stores/slug/:slug`
- **Access**: Public (`@Public()`)
- **Success Response (200 OK)**: Store details, seller business name, and reputation ratings.

#### 3.3 `GET /api/v1/stores/:id`
- **Access**: Public (`@Public()`)
- **Success Response (200 OK)**: Store record by ID.

#### 3.4 `GET /api/v1/stores/seller/my-stores`
- **Access**: Authenticated Seller
- **Success Response (200 OK)**: Array of stores owned by the authenticated seller.

#### 3.5 `POST /api/v1/stores`
- **Access**: `SELLER` (Must have `SellerProfile.verificationStatus === VERIFIED`)
- **Request Body**:
  ```json
  {
    "name": "Bakaara Flagship Electronics",
    "slug": "bakaara-flagship-electronics",
    "description": "Premium electronics and smart devices in Mogadishu.",
    "logoUrl": "https://storage.suuqzo.test/stores/logo1.png",
    "bannerUrl": "https://storage.suuqzo.test/stores/banner1.png",
    "city": "Mogadishu",
    "district": "Howlwadaag",
    "address": "Bakaara Market, 2nd Street",
    "phone": "+252615990011",
    "email": "contact@bakaaratech.so",
    "openingHours": {
      "monday": { "open": "08:00", "close": "21:00" },
      "friday": { "open": "14:00", "close": "22:00" }
    }
  }
  ```
- **Success Response (201 Created)**: Returns created `Store` in `ACTIVE` status.

#### 3.6 `PATCH /api/v1/stores/:id`
- **Access**: Store Owner or `ADMIN`
- **Success Response (200 OK)**: Returns updated store entity.

#### 3.7 `PATCH /api/v1/stores/:id/admin-review`
- **Access**: `ADMIN`, `SUPER_ADMIN` (Permission: `admin.stores.approve`)
- **Request Body**:
  ```json
  {
    "status": "SUSPENDED",
    "reason": "Investigation into copyright infringement report.",
    "isFeatured": false
  }
  ```
- **Success Response (200 OK)**: Returns updated store entity.
