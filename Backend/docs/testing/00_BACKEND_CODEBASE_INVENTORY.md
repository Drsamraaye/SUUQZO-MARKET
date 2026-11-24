# SUUQZO MALL — Backend Codebase Inventory
**Audit Date:** 2026-11-24  
**Auditor:** Independent Security & QA Engineer  
**Backend Root:** `Backend/`  
**Framework:** NestJS (ESM) | **ORM:** Prisma 7 | **DB:** Supabase PostgreSQL

---

## 1. Source Directory Tree (`Backend/src/`)

```
src/
├── app.controller.spec.ts
├── app.controller.ts
├── app.module.ts                    ← Root module (all registrations)
├── app.service.ts
├── main.ts                          ← Bootstrap, CORS, cookie-parser
│
├── audit-logs/
│   ├── audit-logs.module.ts         ← @Global()
│   └── audit-logs.service.ts
│
├── auth/
│   ├── auth.controller.ts           ← /api/v1/auth
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── decorators/                  ← EMPTY DIRECTORY
│   ├── dto/
│   │   ├── change-password.dto.ts
│   │   ├── forgot-password.dto.ts
│   │   ├── login.dto.ts
│   │   ├── refresh-token.dto.ts
│   │   ├── register.dto.ts
│   │   ├── reset-password.dto.ts
│   │   ├── two-factor-confirm.dto.ts
│   │   ├── two-factor-disable.dto.ts
│   │   └── verify-otp.dto.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts        ← IMPLEMENTED AND CONNECTED (APP_GUARD)
│   │   └── optional-auth.guard.ts   ← IMPLEMENTED BUT NOT CONNECTED (future use)
│   ├── services/                    ← EMPTY DIRECTORY
│   └── strategies/                  ← EMPTY DIRECTORY
│
├── authorization/
│   ├── authorization.module.ts
│   ├── authorization.service.ts     ← IMPLEMENTED AND CONNECTED
│   ├── guards/
│   │   ├── permissions.guard.ts     ← IMPLEMENTED AND CONNECTED (APP_GUARD)
│   │   └── roles.guard.ts           ← IMPLEMENTED AND CONNECTED (APP_GUARD)
│   ├── permissions/
│   │   └── permission.constants.ts  ← IMPLEMENTED AND CONNECTED
│   └── policies/                    ← EMPTY DIRECTORY
│
├── brands/
│   ├── brands.controller.ts         ← /api/v1/brands
│   ├── brands.module.ts
│   ├── brands.service.ts
│   └── dto/
│       ├── create-brand.dto.ts
│       └── update-brand.dto.ts
│
├── categories/
│   ├── categories.controller.ts     ← /api/v1/categories
│   ├── categories.module.ts
│   ├── categories.service.ts
│   └── dto/
│       ├── create-category.dto.ts
│       ├── list-categories.dto.ts
│       └── update-category.dto.ts
│
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts   ← IMPLEMENTED AND CONNECTED
│   │   ├── permissions.decorator.ts    ← IMPLEMENTED AND CONNECTED
│   │   ├── public.decorator.ts         ← IMPLEMENTED AND CONNECTED
│   │   └── roles.decorator.ts          ← IMPLEMENTED AND CONNECTED
│   ├── exceptions/
│   │   └── security.exception.ts
│   ├── guards/                          ← EMPTY DIRECTORY
│   └── interfaces/
│       └── request-context.interface.ts
│
├── database/
│   ├── prisma.module.ts             ← @Global()
│   └── prisma.service.ts
│
├── inventory/
│   ├── inventory.controller.ts      ← /api/v1/inventory
│   ├── inventory.module.ts
│   ├── inventory.service.ts
│   └── dto/
│       ├── adjust-stock.dto.ts
│       └── list-inventory.dto.ts
│
├── middleware/
│   ├── authentication-context.middleware.ts
│   ├── request-context.middleware.ts
│   ├── role-context.middleware.ts
│   └── security-headers.middleware.ts
│
├── notifications/
│   ├── notifications.module.ts      ← @Global()
│   └── notifications.service.ts
│
├── otp/
│   ├── otp.module.ts
│   └── otp.service.ts
│
├── password-recovery/
│   ├── password-recovery.module.ts
│   └── password-recovery.service.ts
│
├── products/
│   ├── products.controller.ts       ← /api/v1/products
│   ├── products.module.ts
│   ├── products.service.ts
│   └── dto/
│       ├── create-product.dto.ts
│       ├── moderate-product.dto.ts
│       ├── product-variant.dto.ts
│       ├── query-products.dto.ts
│       └── update-product.dto.ts
│
├── security/
│   ├── password.service.ts          ← Argon2id hashing
│   ├── security.module.ts
│   └── token.service.ts             ← JWT HS256, refresh token rotation
│
├── sellers/
│   ├── sellers.controller.ts        ← /api/v1/sellers
│   ├── sellers.module.ts
│   ├── sellers.service.ts
│   └── dto/
│       ├── list-applications.dto.ts
│       ├── review-kyc-document.dto.ts
│       ├── review-seller-application.dto.ts
│       ├── submit-kyc-document.dto.ts
│       └── submit-seller-application.dto.ts
│
├── sessions/
│   ├── sessions.module.ts
│   └── sessions.service.ts
│
├── stores/
│   ├── stores.controller.ts         ← /api/v1/stores
│   ├── stores.module.ts
│   ├── stores.service.ts
│   └── dto/
│       ├── admin-review-store.dto.ts
│       ├── create-store.dto.ts
│       ├── list-stores.dto.ts
│       └── update-store.dto.ts
│
├── two-factor/
│   ├── two-factor.module.ts
│   └── two-factor.service.ts
│
└── users/
    ├── users.controller.ts          ← /api/v1/users
    ├── users.module.ts
    ├── users.service.ts
    └── dto/
        ├── assign-user-role.dto.ts
        ├── list-users.dto.ts
        ├── update-user-profile.dto.ts
        └── update-user-status.dto.ts
```

---

## 2. Test Directory Tree (`Backend/test/`)

```
test/
├── app.e2e-spec.ts
├── integration/
│   ├── category-hierarchy.spec.ts        ← 10 tests
│   ├── financial-inventory-integrity.spec.ts ← 8 tests
│   ├── inventory-management.spec.ts      ← 6 tests
│   ├── nestjs-integration.spec.ts        ← 3 tests
│   ├── prisma-crud.spec.ts               ← 4 tests
│   ├── product-management.spec.ts        ← 10 tests
│   ├── seller-onboarding.spec.ts         ← 10 tests
│   ├── store-management.spec.ts          ← 11 tests
│   └── user-management.spec.ts           ← 14 tests
├── security/
│   ├── independent-audit.spec.ts         ← 32 tests (see failures below)
│   ├── phase04-security.spec.ts          ← 9 tests
│   ├── phase05-security.spec.ts          ← 7 tests
│   └── rbac.spec.ts                      ← 18 tests
└── unit/
    ├── otp-service.spec.ts               ← 6 tests
    ├── password-service.spec.ts          ← 9 tests
    ├── schema-verification.spec.ts       ← 4 tests
    ├── token-service.spec.ts             ← 9 tests
    └── two-factor.spec.ts                ← 3 tests
```
**Unit test file in src/:** `src/app.controller.spec.ts` — 1 test

**Total declared test count: 174 tests**

---

## 3. Component Classification

| Component | Location | Status |
|---|---|---|
| `JwtAuthGuard` | `src/auth/guards/jwt-auth.guard.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `OptionalAuthGuard` | `src/auth/guards/optional-auth.guard.ts` | ✅ IMPLEMENTED BUT NOT CONNECTED |
| `RolesGuard` | `src/authorization/guards/roles.guard.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `PermissionsGuard` | `src/authorization/guards/permissions.guard.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `AuthorizationService` | `src/authorization/authorization.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `PasswordService` | `src/security/password.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `TokenService` | `src/security/token.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `SessionsService` | `src/sessions/sessions.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `OtpService` | `src/otp/otp.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `TwoFactorService` | `src/two-factor/two-factor.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `PasswordRecoveryService` | `src/password-recovery/password-recovery.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `AuditLogsService` | `src/audit-logs/audit-logs.service.ts` | ✅ IMPLEMENTED AND CONNECTED (@Global) |
| `NotificationsService` | `src/notifications/notifications.service.ts` | ✅ IMPLEMENTED AND CONNECTED (@Global) |
| `UsersService` | `src/users/users.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `SellersService` | `src/sellers/sellers.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `StoresService` | `src/stores/stores.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `CategoriesService` | `src/categories/categories.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `BrandsService` | `src/brands/brands.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `ProductsService` | `src/products/products.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `InventoryService` | `src/inventory/inventory.service.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `@CurrentUser` decorator | `src/common/decorators/current-user.decorator.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `@Roles` decorator | `src/common/decorators/roles.decorator.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `@RequirePermissions` decorator | `src/common/decorators/permissions.decorator.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `@Public` decorator | `src/common/decorators/public.decorator.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `SecurityHeadersMiddleware` | `src/middleware/security-headers.middleware.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `RequestContextMiddleware` | `src/middleware/request-context.middleware.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `AuthenticationContextMiddleware` | `src/middleware/authentication-context.middleware.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `RoleContextMiddleware` | `src/middleware/role-context.middleware.ts` | ✅ IMPLEMENTED AND CONNECTED |
| `src/auth/decorators/` | — | ⚠️ EMPTY DIRECTORY |
| `src/auth/services/` | — | ⚠️ EMPTY DIRECTORY |
| `src/auth/strategies/` | — | ⚠️ EMPTY DIRECTORY |
| `src/authorization/policies/` | — | ⚠️ EMPTY DIRECTORY |
| `src/common/guards/` | — | ⚠️ EMPTY DIRECTORY |
| Cart module | — | ❌ NOT IMPLEMENTED |
| Orders module | — | ❌ NOT IMPLEMENTED |
| Payments module | — | ❌ NOT IMPLEMENTED |
| Delivery/Riders module | — | ❌ NOT IMPLEMENTED |
| Admin reporting dashboard | — | ❌ NOT IMPLEMENTED |

---

## 4. Global Registration Verification (`app.module.ts`)

```
APP_PIPE  → ValidationPipe(whitelist, forbidNonWhitelisted, transform)
APP_GUARD → JwtAuthGuard       [1st]
APP_GUARD → RolesGuard         [2nd]
APP_GUARD → PermissionsGuard   [3rd]

Middleware chain (all routes):
  SecurityHeadersMiddleware
  → RequestContextMiddleware
  → AuthenticationContextMiddleware
  → RoleContextMiddleware
```

---

## 5. Module Import Graph

| Module | Imports |
|---|---|
| AppModule | PrismaModule, SecurityModule, SessionsModule, UsersModule, AuthorizationModule, AuthModule, AuditLogsModule, NotificationsModule, SellersModule, StoresModule, CategoriesModule, BrandsModule, ProductsModule, InventoryModule |
| AuthModule | SecurityModule, SessionsModule, UsersModule, OtpModule, TwoFactorModule, PasswordRecoveryModule, AuthorizationModule |
| AuditLogsModule | PrismaModule — `@Global()` |
| NotificationsModule | PrismaModule — `@Global()` |
| PrismaModule | — `@Global()` |

---

## 6. Empty Directories (Leftover Scaffolding)

| Path | Notes |
|---|---|
| `src/auth/decorators/` | Empty — decorators live in `src/common/decorators/` |
| `src/auth/services/` | Empty — services live at module root (auth.service.ts) |
| `src/auth/strategies/` | Empty — no Passport strategy used (custom JWT guard) |
| `src/authorization/policies/` | Empty — policy pattern not implemented |
| `src/common/guards/` | Empty — guards live in module-specific guard directories |

---

## 7. Files That Exist But Are Never Imported

| File | Reason |
|---|---|
| `src/auth/guards/optional-auth.guard.ts` | Implemented but not applied to any route yet — reserved for future public catalogue |

---

*Report generated by independent audit. No files were created, modified or deleted.*
