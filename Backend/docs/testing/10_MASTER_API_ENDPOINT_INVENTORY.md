# SUUQZO MALL — Master API Endpoint Inventory
**Audit Date:** 2026-11-24  
**Base URL:** `http://localhost:3000`  
**API Version Prefix:** `/api/v1/`  
**Total Endpoints: 48**

Legend: 🔓 Public | 🔑 Authenticated | 👑 SUPER_ADMIN | 🛡️ ADMIN | 🏪 SELLER

---

## Module: App (Health)

| Method | Route | Access | DTO | Test Status |
|---|---|---|---|---|
| GET | `/` | 🔓 Public | — | ✅ TESTED (app.controller.spec.ts) |

---

## Module: Auth (`/api/v1/auth`)

| Method | Route | Access | DTO | Guard | Test Status |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | 🔓 Public | RegisterDto | None | ✅ TESTED |
| POST | `/api/v1/auth/login` | 🔓 Public | LoginDto | None | ✅ TESTED |
| POST | `/api/v1/auth/refresh` | 🔓 Public | RefreshTokenDto | None | ✅ TESTED |
| POST | `/api/v1/auth/verify-phone` | 🔓 Public | VerifyOtpDto | None | ✅ TESTED |
| POST | `/api/v1/auth/forgot-password` | 🔓 Public | ForgotPasswordDto | None | ✅ TESTED |
| POST | `/api/v1/auth/reset-password` | 🔓 Public | ResetPasswordDto | None | ✅ TESTED |
| GET | `/api/v1/auth/me` | 🔑 Auth | — | JWT | ✅ TESTED |
| POST | `/api/v1/auth/logout` | 🔑 Auth | RefreshTokenDto (optional) | JWT | ✅ TESTED |
| POST | `/api/v1/auth/logout-all` | 🔑 Auth | — | JWT | ✅ TESTED |
| POST | `/api/v1/auth/change-password` | 🔑 Auth | ChangePasswordDto | JWT | ✅ TESTED |
| POST | `/api/v1/auth/2fa/enroll` | 🔑 Auth | — | JWT | ✅ TESTED |
| POST | `/api/v1/auth/2fa/confirm` | 🔑 Auth | TwoFactorConfirmDto | JWT | ✅ TESTED |
| POST | `/api/v1/auth/2fa/disable` | 🔑 Auth | TwoFactorDisableDto | JWT | ✅ TESTED |

> [!NOTE]  
> `POST /api/v1/auth/resend-verification` is documented in prior phases but **NOT present** in AuthController source. The verify-phone endpoint handles both initial verification and re-verification via OTP resend in OtpService.

---

## Module: Users (`/api/v1/users`)

| Method | Route | Access | Required Permission | DTO | Test Status |
|---|---|---|---|---|---|
| GET | `/api/v1/users` | 🛡️ ADMIN | `admin.users.view` | ListUsersDto | ✅ TESTED |
| GET | `/api/v1/users/:id` | 🔑 Self or ADMIN | — | — | ✅ TESTED |
| PATCH | `/api/v1/users/:id` | 🔑 Self or ADMIN | — | UpdateUserProfileDto | ✅ TESTED |
| PATCH | `/api/v1/users/:id/status` | 🛡️ ADMIN | `admin.users.suspend` | UpdateUserStatusDto | ✅ TESTED |
| POST | `/api/v1/users/:id/roles` | 👑 SUPER_ADMIN | `admin.users.roles` | AssignUserRoleDto | ✅ TESTED |
| GET | `/api/v1/users/:id/audit` | 🔑 Self or ADMIN | — | — | ✅ TESTED |

---

## Module: Sellers (`/api/v1/sellers`)

| Method | Route | Access | Required Permission | DTO | Test Status |
|---|---|---|---|---|---|
| POST | `/api/v1/sellers/apply` | 🔑 Auth | — | SubmitSellerApplicationDto | ✅ TESTED |
| GET | `/api/v1/sellers/me` | 🔑 Auth | — | — | ✅ TESTED |
| POST | `/api/v1/sellers/kyc-documents` | 🔑 Auth | — | SubmitKycDocumentDto | ✅ TESTED |
| GET | `/api/v1/sellers/applications` | 🛡️ ADMIN | `admin.sellers.view` | ListApplicationsDto | ✅ TESTED |
| GET | `/api/v1/sellers/applications/:id` | 🛡️ ADMIN | `admin.sellers.view` | — | ✅ TESTED |
| PATCH | `/api/v1/sellers/applications/:id/review` | 🛡️ ADMIN | `admin.sellers.approve` | ReviewSellerApplicationDto | ✅ TESTED |
| PATCH | `/api/v1/sellers/kyc-documents/:id/review` | 🛡️ ADMIN | `admin.sellers.review` | ReviewKycDocumentDto | ✅ TESTED |
| GET | `/api/v1/sellers/:id/documents` | 🔑 Owner or ADMIN | — | — | ✅ TESTED |

---

## Module: Stores (`/api/v1/stores`)

| Method | Route | Access | Required Permission | DTO | Test Status |
|---|---|---|---|---|---|
| GET | `/api/v1/stores` | 🔓 Public | — | ListStoresDto | ✅ TESTED |
| GET | `/api/v1/stores/seller/my-stores` | 🏪 SELLER | — | — | ✅ TESTED |
| GET | `/api/v1/stores/admin/all` | 🛡️ ADMIN | `admin.stores.view` | ListStoresDto | ✅ TESTED |
| GET | `/api/v1/stores/slug/:slug` | 🔓 Public | — | — | ✅ TESTED |
| GET | `/api/v1/stores/:id` | 🔓 Public | — | — | ✅ TESTED |
| POST | `/api/v1/stores` | 🏪 SELLER | — | CreateStoreDto | ✅ TESTED |
| PATCH | `/api/v1/stores/:id` | 🔑 Owner or ADMIN | — | UpdateStoreDto | ✅ TESTED |
| PATCH | `/api/v1/stores/:id/admin-review` | 🛡️ ADMIN | `admin.stores.approve` | AdminReviewStoreDto | ✅ TESTED |

---

## Module: Categories (`/api/v1/categories`)

| Method | Route | Access | Required Permission | DTO | Test Status |
|---|---|---|---|---|---|
| GET | `/api/v1/categories` | 🔓 Public | — | ListCategoriesDto | ✅ TESTED |
| GET | `/api/v1/categories/admin/all` | 🛡️ ADMIN | `admin.categories.manage` | ListCategoriesDto | ✅ TESTED |
| GET | `/api/v1/categories/slug/:slug` | 🔓 Public | — | — | ✅ TESTED |
| GET | `/api/v1/categories/:id` | 🔓 Public | — | — | ✅ TESTED |
| POST | `/api/v1/categories` | 🛡️ ADMIN | `admin.categories.manage` | CreateCategoryDto | ✅ TESTED |
| PATCH | `/api/v1/categories/:id` | 🛡️ ADMIN | `admin.categories.manage` | UpdateCategoryDto | ✅ TESTED |
| DELETE | `/api/v1/categories/:id` | 🛡️ ADMIN | `admin.categories.manage` | — | ✅ TESTED |

---

## Module: Brands (`/api/v1/brands`)

| Method | Route | Access | Required Permission | DTO | Test Status |
|---|---|---|---|---|---|
| GET | `/api/v1/brands` | 🔓 Public | — | — | ✅ TESTED |
| GET | `/api/v1/brands/:id` | 🔓 Public | — | — | ✅ TESTED |
| POST | `/api/v1/brands` | 🛡️ ADMIN | `admin.products.edit` | CreateBrandDto | ✅ TESTED |
| PATCH | `/api/v1/brands/:id` | 🛡️ ADMIN | `admin.products.edit` | UpdateBrandDto | ✅ TESTED |

> [!NOTE]  
> All 4 Brand endpoints are fully tested directly in `test/integration/brands-and-auth-missing.spec.ts` covering creation, slug conflicts, listing with product counts, ID lookup, updates, and 404 error cases.

---

## Module: Products (`/api/v1/products`)

| Method | Route | Access | Required Permission | DTO | Test Status |
|---|---|---|---|---|---|
| GET | `/api/v1/products` | 🔓 Public | — | QueryProductsDto | ✅ TESTED |
| GET | `/api/v1/products/admin/all` | 🛡️ ADMIN | `admin.products.view` | QueryProductsDto | ✅ TESTED |
| GET | `/api/v1/products/:storeSlug/:productSlug` | 🔓 Public | — | — | ✅ TESTED |
| GET | `/api/v1/products/:id` | 🔓 Public | — | — | ✅ TESTED |
| POST | `/api/v1/products` | 🏪 SELLER | — | CreateProductDto | ✅ TESTED |
| PATCH | `/api/v1/products/:id` | 🏪 SELLER (owner) | — | UpdateProductDto | ✅ TESTED |
| POST | `/api/v1/products/:id/submit-review` | 🏪 SELLER (owner) | — | — | ✅ TESTED |
| PATCH | `/api/v1/products/:id/moderate` | 🛡️ ADMIN | `admin.products.approve` | ModerateProductDto | ✅ TESTED |
| DELETE | `/api/v1/products/:id` | 🏪 SELLER (owner) | — | — | ✅ TESTED |

---

## Module: Inventory (`/api/v1/inventory`)

| Method | Route | Access | DTO | Test Status |
|---|---|---|---|---|
| GET | `/api/v1/inventory/availability/:variantId/:storeId` | 🔓 Public | — | ✅ TESTED |
| GET | `/api/v1/inventory` | 🏪 SELLER or ADMIN | ListInventoryDto | ✅ TESTED |
| GET | `/api/v1/inventory/:id/movements` | 🏪 SELLER or ADMIN | — | ✅ TESTED |
| POST | `/api/v1/inventory/adjust` | 🏪 SELLER or ADMIN | AdjustStockDto | ✅ TESTED |

---

## Module: Cart (`/api/v1/cart`)

| Method | Route | Access | DTO | Test Status |
|---|---|---|---|---|
| POST | `/api/v1/cart/items` | 👤 CUSTOMER | AddToCartDto | ✅ TESTED |
| GET | `/api/v1/cart` | 👤 CUSTOMER | — | ✅ TESTED |
| PATCH | `/api/v1/cart/items/:itemId` | 👤 CUSTOMER | UpdateCartItemDto | ✅ TESTED |
| DELETE | `/api/v1/cart/items/:itemId` | 👤 CUSTOMER | — | ✅ TESTED |
| DELETE | `/api/v1/cart` | 👤 CUSTOMER | — | ✅ TESTED |

---

## Module: Checkout (`/api/v1/checkout`)

| Method | Route | Access | DTO | Test Status |
|---|---|---|---|---|
| POST | `/api/v1/checkout` | 👤 CUSTOMER | CheckoutDto | ✅ TESTED |

---

## Module: Orders (`/api/v1/orders`, `/api/v1/seller/orders`, `/api/v1/admin/orders`)

| Method | Route | Access | DTO | Test Status |
|---|---|---|---|---|
| GET | `/api/v1/orders` | 👤 CUSTOMER | QueryOrdersDto | ✅ TESTED |
| GET | `/api/v1/orders/:id` | 👤 CUSTOMER | — | ✅ TESTED |
| POST | `/api/v1/orders/:id/cancel` | 👤 CUSTOMER | CancelOrderDto | ✅ TESTED |
| GET | `/api/v1/orders/:id/tracking` | 👤 CUSTOMER | — | ✅ TESTED |
| GET | `/api/v1/seller/orders` | 🏪 SELLER | QueryOrdersDto | ✅ TESTED |
| GET | `/api/v1/seller/orders/:id` | 🏪 SELLER | — | ✅ TESTED |
| PATCH | `/api/v1/seller/orders/:id/status` | 🏪 SELLER | UpdateSubOrderStatusDto | ✅ TESTED |
| POST | `/api/v1/seller/orders/:id/reject` | 🏪 SELLER | CancelOrderDto | ✅ TESTED |
| GET | `/api/v1/admin/orders` | 🛡️ ADMIN | QueryOrdersDto | ✅ TESTED |
| GET | `/api/v1/admin/orders/:id` | 🛡️ ADMIN | — | ✅ TESTED |
| PATCH | `/api/v1/admin/orders/:id/status` | 🛡️ ADMIN | UpdateOrderStatusDto | ✅ TESTED |
| POST | `/api/v1/admin/orders/:id/cancel` | 🛡️ ADMIN | CancelOrderDto | ✅ TESTED |

---

## Module: Payments & Financial Management (`/api/v1/payments`, `/api/v1/admin/payments`, `/api/v1/admin/refunds`, `/api/v1/admin/ledger`, `/api/v1/admin/payouts`, `/api/v1/seller`, `/api/v1/webhooks/payment`)

| Method | Route | Access | DTO | Test Status |
|---|---|---|---|---|
| POST | `/api/v1/payments` | 👤 CUSTOMER | CreatePaymentDto | ✅ TESTED |
| GET | `/api/v1/payments/mine` | 👤 CUSTOMER | QueryPaymentsDto | ✅ TESTED |
| GET | `/api/v1/payments/:id` | 👤 CUSTOMER / 🏪 SELLER / 🛡️ ADMIN | — | ✅ TESTED |
| POST | `/api/v1/webhooks/payment` | 🌐 PUBLIC (HMAC) | — | ✅ TESTED |
| POST | `/api/v1/webhooks/payment/:provider` | 🌐 PUBLIC (HMAC) | — | ✅ TESTED |
| GET | `/api/v1/admin/payments` | 🛡️ ADMIN | QueryPaymentsDto | ✅ TESTED |
| GET | `/api/v1/admin/payments/:id` | 🛡️ ADMIN | — | ✅ TESTED |
| POST | `/api/v1/admin/payments/:id/verify-bank-transfer` | 🛡️ ADMIN | VerifyBankTransferDto | ✅ TESTED |
| POST | `/api/v1/admin/payments/:id/confirm-cod` | 🛡️ ADMIN | CollectCodDto | ✅ TESTED |
| POST | `/api/v1/admin/refunds` | 🛡️ ADMIN | CreateRefundDto | ✅ TESTED |
| GET | `/api/v1/admin/refunds` | 🛡️ ADMIN | — | ✅ TESTED |
| GET | `/api/v1/admin/refunds/:id` | 🛡️ ADMIN | — | ✅ TESTED |
| GET | `/api/v1/admin/ledger/accounts` | 🛡️ ADMIN | — | ✅ TESTED |
| GET | `/api/v1/admin/ledger/transactions` | 🛡️ ADMIN | — | ✅ TESTED |
| POST | `/api/v1/admin/payouts/generate` | 🛡️ ADMIN | CreatePayoutBatchDto | ✅ TESTED |
| POST | `/api/v1/admin/payouts/:batchId/approve` | 🛡️ ADMIN | — | ✅ TESTED |
| GET | `/api/v1/admin/payouts` | 🛡️ ADMIN | — | ✅ TESTED |
| GET | `/api/v1/seller/balance` | 🏪 SELLER | — | ✅ TESTED |
| GET | `/api/v1/seller/payouts` | 🏪 SELLER | — | ✅ TESTED |

---

## Endpoint Count Summary

| Module | Endpoints | Tested | Untested |
|---|---|---|---|
| App | 1 | 1 | 0 |
| Auth | 13 | 13 | 0 |
| Users | 6 | 6 | 0 |
| Sellers | 8 | 8 | 0 |
| Stores | 8 | 8 | 0 |
| Categories | 7 | 7 | 0 |
| Brands | 4 | 4 | 0 |
| Products | 9 | 9 | 0 |
| Inventory | 4 | 4 | 0 |
| Cart | 5 | 5 | 0 |
| Checkout | 1 | 1 | 0 |
| Orders | 12 | 12 | 0 |
| Payments & Finance | 19 | 19 | 0 |
| **TOTAL** | **97** | **97 (100%)** | **0 (0%)** |

---

## Not-Implemented Endpoints (Future Phases)

| Phase | Planned Endpoints |
|---|---|
| Phase 08 | `/api/v1/delivery`, `/api/v1/riders` |
| Phase 09 | `/api/v1/notifications`, `/api/v1/admin/reports`, `/api/v1/support` |
