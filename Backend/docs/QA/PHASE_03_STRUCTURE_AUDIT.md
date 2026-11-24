# SUUQZO MALL — Phase 03 Structural Inventory & Codebase Audit

**Date**: 2026-11-23  
**Auditor**: Principal Architecture & QA Auditor  
**Target Directory**: `Backend/src/`  
**Objective**: Comprehensive structural inventory, classification of every directory and file, identification of empty folders, mapping of actual component locations, tracking module registrations/imports, and identification of unused or disconnected implementations.

---

## 1. Complete Directory Tree (`Backend/src/`)

```text
Backend/src/
│
├── app.controller.spec.ts
├── app.controller.ts
├── app.module.ts
├── app.service.ts
├── main.ts
│
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── decorators/                          [EMPTY DIRECTORY]
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
│   │   ├── jwt-auth.guard.ts
│   │   └── optional-auth.guard.ts
│   ├── services/                            [EMPTY DIRECTORY]
│   └── strategies/                          [EMPTY DIRECTORY]
│
├── authorization/
│   ├── authorization.module.ts
│   ├── authorization.service.ts
│   ├── guards/
│   │   ├── permissions.guard.ts
│   │   └── roles.guard.ts
│   ├── permissions/
│   │   └── permission.constants.ts
│   └── policies/                            [EMPTY DIRECTORY]
│
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── permissions.decorator.ts
│   │   ├── public.decorator.ts
│   │   └── roles.decorator.ts
│   ├── exceptions/
│   │   └── security.exception.ts
│   ├── guards/                              [EMPTY DIRECTORY]
│   └── interfaces/
│       └── request-context.interface.ts
│
├── database/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── middleware/
│   ├── authentication-context.middleware.ts
│   ├── request-context.middleware.ts
│   ├── role-context.middleware.ts
│   └── security-headers.middleware.ts
│
├── otp/
│   ├── otp.module.ts
│   └── otp.service.ts
│
├── password-recovery/
│   ├── password-recovery.module.ts
│   └── password-recovery.service.ts
│
├── security/
│   ├── password.service.ts
│   ├── security.module.ts
│   └── token.service.ts
│
├── sessions/
│   ├── sessions.module.ts
│   └── sessions.service.ts
│
├── two-factor/
│   ├── two-factor.module.ts
│   └── two-factor.service.ts
│
└── users/
    ├── users.module.ts
    └── users.service.ts
```

### Statistical Summary
- **Total Directories**: 23
- **Empty Directories**: 5
- **Total Files**: 49
  - Root files: 5
  - Modules: 11
  - Services: 10
  - Controllers: 2
  - Guards: 4
  - Decorators: 4
  - Middleware: 4
  - DTOs: 9
  - Exceptions: 1
  - Interfaces & Constants: 2
  - Test/Spec files: 1 (`app.controller.spec.ts`)

---

## 2. Empty Directories Audit

| Directory Path | Classification | Explanation & Actual Implementation Location |
|---|---|---|
| `Backend/src/auth/decorators/` | **EMPTY DIRECTORY** | Intended for auth decorators. All parameter and route decorators were placed in `Backend/src/common/decorators/` (`@Public()`, `@CurrentUser()`, `@ActiveRole()`, `@Roles()`, `@RequirePermissions()`). |
| `Backend/src/auth/services/` | **EMPTY DIRECTORY** | Intended for auth sub-services. Instead of placing nested services here, the architecture split domain services into dedicated standalone modules: `src/security/` (`PasswordService`, `TokenService`), `src/sessions/` (`SessionsService`), `src/otp/` (`OtpService`), `src/two-factor/` (`TwoFactorService`), `src/password-recovery/` (`PasswordRecoveryService`), and `src/auth/auth.service.ts` at the auth module root. |
| `Backend/src/auth/strategies/` | **EMPTY DIRECTORY** | Intended for Passport strategies. The architecture implemented native NestJS `CanActivate` guards (`JwtAuthGuard`) leveraging `TokenService` (jsonwebtoken) rather than Passport-JWT strategy classes. |
| `Backend/src/authorization/policies/` | **EMPTY DIRECTORY** | Intended for Casl / policy classes. Authorization is enforced directly via `RolesGuard` (checking `UserRole[]`) and `PermissionsGuard` (checking `AdminProfile.permissions` against `permission.constants.ts`). No policy classes exist. |
| `Backend/src/common/guards/` | **EMPTY DIRECTORY** | Intended for common guards. Guards were placed specifically in their respective functional modules: `src/auth/guards/` (`JwtAuthGuard`, `OptionalAuthGuard`) and `src/authorization/guards/` (`RolesGuard`, `PermissionsGuard`). |

---

## 3. Specific Inquiries Investigation

### Investigation 1: `src/auth/decorators/`
- **Status**: **EMPTY DIRECTORY**
- **Expected**: Decorators for authentication (e.g., `@Public()`, `@CurrentUser()`, `@Roles()`).
- **Actual Location**: `Backend/src/common/decorators/`
  - `public.decorator.ts`: Exports `@Public()` and `IS_PUBLIC_KEY`.
  - `current-user.decorator.ts`: Exports `@CurrentUser()` and `@ActiveRole()`.
  - `roles.decorator.ts`: Exports `@Roles(...roles)` and `ROLES_KEY`.
  - `permissions.decorator.ts`: Exports `@RequirePermissions(...permissions)` and `PERMISSIONS_KEY`.
- **Classification**: **IMPLEMENTED IN ANOTHER DIRECTORY** (`src/common/decorators/`) & **IMPLEMENTED AND CONNECTED** (imported by `auth.controller.ts`, `jwt-auth.guard.ts`, `roles.guard.ts`, `permissions.guard.ts`).

### Investigation 2: `src/auth/services/`
- **Status**: **EMPTY DIRECTORY**
- **Expected**: Specialized authentication domain services.
- **Actual Location**:
  - `Backend/src/auth/auth.service.ts`: Root coordinator service in `src/auth/`.
  - `Backend/src/security/password.service.ts`: Argon2id hashing and policy validation in `src/security/`.
  - `Backend/src/security/token.service.ts`: JWT access tokens and raw refresh tokens in `src/security/`.
  - `Backend/src/sessions/sessions.service.ts`: PostgreSQL session tracking and revocation in `src/sessions/`.
  - `Backend/src/otp/otp.service.ts`: Hashed OTP dispatch and verification in `src/otp/`.
  - `Backend/src/two-factor/two-factor.service.ts`: TOTP and encrypted secrets in `src/two-factor/`.
  - `Backend/src/password-recovery/password-recovery.service.ts`: Single-use reset tokens in `src/password-recovery/`.
- **Classification**: **IMPLEMENTED IN ANOTHER DIRECTORY** (Modularized into dedicated domain directories: `src/security/`, `src/sessions/`, `src/otp/`, `src/two-factor/`, `src/password-recovery/`, and `src/auth/auth.service.ts`).

### Investigation 3: `src/authorization/policies/`
- **Status**: **EMPTY DIRECTORY**
- **Expected**: Attribute-based access control (ABAC) or Casl policy definitions.
- **Actual Location**:
  - `Backend/src/authorization/guards/permissions.guard.ts`: Evaluates admin permissions directly from `AdminProfile.permissions` JSON array.
  - `Backend/src/authorization/guards/roles.guard.ts`: Evaluates role membership from `user.role` and `user.assignedRoles`.
  - `Backend/src/authorization/permissions/permission.constants.ts`: Enumerates all valid system permission strings.
- **Classification**: **MISSING (As separate policy classes)** / **IMPLEMENTED IN ANOTHER DIRECTORY** (Inline logic inside `PermissionsGuard` and `RolesGuard`).

### Investigation 4: `src/common/guards/`
- **Status**: **EMPTY DIRECTORY**
- **Expected**: Global/common guards.
- **Actual Location**:
  - `Backend/src/auth/guards/jwt-auth.guard.ts`: JWT authentication guard.
  - `Backend/src/auth/guards/optional-auth.guard.ts`: Anonymous/optional JWT guard.
  - `Backend/src/authorization/guards/roles.guard.ts`: Role authorization guard.
  - `Backend/src/authorization/guards/permissions.guard.ts`: Granular permission guard.
- **Classification**: **IMPLEMENTED IN ANOTHER DIRECTORY** (`src/auth/guards/` and `src/authorization/guards/`).

---

## 4. Comprehensive Inventory & Classification of All Components

### A. Root Files
| File Path | Description | Classification | Importing / Registering Module |
|---|---|---|---|
| `src/main.ts` | NestJS bootstrap entrypoint | **IMPLEMENTED AND CONNECTED** | Configured in `package.json`, bootstraps `AppModule` |
| `src/app.module.ts` | Root application module | **IMPLEMENTED AND CONNECTED** | Bootstrapped by `main.ts` |
| `src/app.controller.ts` | Root baseline controller | **IMPLEMENTED AND CONNECTED** | Registered in `AppModule.controllers` |
| `src/app.service.ts` | Root baseline service | **IMPLEMENTED AND CONNECTED** | Provided in `AppModule.providers` |
| `src/app.controller.spec.ts` | Controller unit test | **IMPLEMENTED AND CONNECTED** | Executed by `vitest` |

---

### B. Module: `AuthModule` (`src/auth/`)
| File Path | Component | Classification | Registering / Consuming Modules |
|---|---|---|---|
| `src/auth/auth.module.ts` | NestJS Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule` |
| `src/auth/auth.controller.ts` | Controller | **IMPLEMENTED AND CONNECTED** | Declared in `AuthModule.controllers` |
| `src/auth/auth.service.ts` | Core Auth Service | **IMPLEMENTED AND CONNECTED** | Declared in `AuthModule.providers`, injected in `AuthController` |
| `src/auth/guards/jwt-auth.guard.ts` | Global Auth Guard | **IMPLEMENTED AND CONNECTED** | Registered globally as `APP_GUARD` in `AppModule` |
| `src/auth/guards/optional-auth.guard.ts` | Optional Auth Guard | **IMPLEMENTED BUT NOT CONNECTED** | Not imported or registered by any module or route |
| `src/auth/dto/register.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.register`, `AuthService.register` |
| `src/auth/dto/login.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.login`, `AuthService.login` |
| `src/auth/dto/refresh-token.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.refresh`, `AuthController.logout` |
| `src/auth/dto/verify-otp.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.verifyPhone` |
| `src/auth/dto/forgot-password.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.forgotPassword` |
| `src/auth/dto/reset-password.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.resetPassword` |
| `src/auth/dto/change-password.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.changePassword` |
| `src/auth/dto/two-factor-confirm.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.twoFactorConfirm` |
| `src/auth/dto/two-factor-disable.dto.ts` | DTO | **IMPLEMENTED AND CONNECTED** | Used by `AuthController.twoFactorDisable` |

---

### C. Module: `AuthorizationModule` (`src/authorization/`)
| File Path | Component | Classification | Registering / Consuming Modules |
|---|---|---|---|
| `src/authorization/authorization.module.ts` | NestJS Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule` |
| `src/authorization/authorization.service.ts` | Service | **IMPLEMENTED BUT NOT CONNECTED** | Declared & exported in `AuthorizationModule`, but never injected into any controller or guard |
| `src/authorization/guards/roles.guard.ts` | Global Roles Guard | **IMPLEMENTED AND CONNECTED** | Registered globally as `APP_GUARD` in `AppModule` |
| `src/authorization/guards/permissions.guard.ts` | Global Permissions Guard | **IMPLEMENTED AND CONNECTED** | Registered globally as `APP_GUARD` in `AppModule` |
| `src/authorization/permissions/permission.constants.ts` | Constants | **IMPLEMENTED AND CONNECTED** | Imported by `authorization.service.ts` and test suites |

---

### D. Module: `Common` (`src/common/`)
| File Path | Component | Classification | Registering / Consuming Modules |
|---|---|---|---|
| `src/common/decorators/public.decorator.ts` | `@Public()` | **IMPLEMENTED AND CONNECTED** | Used in `AuthController`, `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` |
| `src/common/decorators/current-user.decorator.ts` | `@CurrentUser()`, `@ActiveRole()` | **IMPLEMENTED AND CONNECTED** | Used in `AuthController` |
| `src/common/decorators/roles.decorator.ts` | `@Roles()` | **IMPLEMENTED AND CONNECTED** | Used in `RolesGuard` and security test suites |
| `src/common/decorators/permissions.decorator.ts` | `@RequirePermissions()` | **IMPLEMENTED AND CONNECTED** | Used in `PermissionsGuard` and security test suites |
| `src/common/exceptions/security.exception.ts` | Custom Exceptions | **IMPLEMENTED BUT NOT CONNECTED** | Defines 5 domain exceptions (`AccountSuspendedException`, etc.), but services throw standard NestJS HTTP exceptions |
| `src/common/interfaces/request-context.interface.ts` | TypeScript Interfaces | **IMPLEMENTED AND CONNECTED** | Imported by `token.service.ts`, `auth.service.ts` |

---

### E. Module: `DatabaseModule` (`src/database/`)
| File Path | Component | Classification | Registering / Consuming Modules |
|---|---|---|---|
| `src/database/prisma.module.ts` | Global Prisma Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule` with `@Global()` |
| `src/database/prisma.service.ts` | Prisma ORM Service | **IMPLEMENTED AND CONNECTED** | Exported by `PrismaModule`, injected in all database-dependent services |

---

### F. Module: `Middleware` (`src/middleware/`)
| File Path | Component | Classification | Registering / Consuming Modules |
|---|---|---|---|
| `src/middleware/security-headers.middleware.ts` | HTTP Headers Middleware | **IMPLEMENTED AND CONNECTED** | Registered in `AppModule.configure` for `*` routes |
| `src/middleware/request-context.middleware.ts` | UUID Request Tracing | **IMPLEMENTED AND CONNECTED** | Registered in `AppModule.configure` for `*` routes |
| `src/middleware/authentication-context.middleware.ts` | Token Payload Decoder | **IMPLEMENTED AND CONNECTED** | Registered in `AppModule.configure` for `*` routes |
| `src/middleware/role-context.middleware.ts` | Role Header Sanitizer | **IMPLEMENTED AND CONNECTED** | Registered in `AppModule.configure` for `*` routes |

---

### G. Domain Security Modules
| File Path | Component | Classification | Registering / Consuming Modules |
|---|---|---|---|
| `src/security/security.module.ts` | Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule`, `AuthModule`, `PasswordRecoveryModule` |
| `src/security/password.service.ts` | Argon2id Service | **IMPLEMENTED AND CONNECTED** | Exported by `SecurityModule`, injected in `AuthService`, `TwoFactorService`, `PasswordRecoveryService` |
| `src/security/token.service.ts` | JWT / Token Service | **IMPLEMENTED AND CONNECTED** | Exported by `SecurityModule`, injected in `AuthService`, `JwtAuthGuard` |
| `src/sessions/sessions.module.ts` | Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule`, `AuthModule`, `PasswordRecoveryModule` |
| `src/sessions/sessions.service.ts` | Session Service | **IMPLEMENTED AND CONNECTED** | Exported by `SessionsModule`, injected in `AuthService`, `JwtAuthGuard`, `PasswordRecoveryService` |
| `src/otp/otp.module.ts` | Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule`, `AuthModule` |
| `src/otp/otp.service.ts` | OTP Service | **IMPLEMENTED AND CONNECTED** | Exported by `OtpModule`, injected in `AuthService` |
| `src/two-factor/two-factor.module.ts` | Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule`, `AuthModule` |
| `src/two-factor/two-factor.service.ts` | 2FA TOTP Service | **IMPLEMENTED AND CONNECTED** | Exported by `TwoFactorModule`, injected in `AuthService`, `AuthController` |
| `src/password-recovery/password-recovery.module.ts` | Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule`, `AuthModule` |
| `src/password-recovery/password-recovery.service.ts` | Password Reset Service | **IMPLEMENTED AND CONNECTED** | Exported by `PasswordRecoveryModule`, injected in `AuthController` |
| `src/users/users.module.ts` | Module | **IMPLEMENTED AND CONNECTED** | Imported by `AppModule` |
| `src/users/users.service.ts` | User Query Service | **IMPLEMENTED BUT NOT CONNECTED** | Declared & exported by `UsersModule`, but not injected by any other service or controller |

---

## 5. Unused or Disconnected Implementations

The audit identified 4 files that exist on disk but are **not connected or utilized** by the runtime:

1. **`src/auth/guards/optional-auth.guard.ts`**
   - **Reason**: Implements `OptionalAuthGuard` for anonymous/optional token extraction. Not bound to any route or registered in any module.
   - **Recommendation**: Retain for Phase 04+ public catalogue endpoints (e.g., browse products with personalized pricing/cart if logged in).

2. **`src/common/exceptions/security.exception.ts`**
   - **Reason**: Declares custom HTTP exceptions (`AccountSuspendedException`, `AccountLockedException`, `InvalidActiveRoleException`, `CompromisedTokenFamilyException`, `ResourceOwnershipException`). However, `AuthService` and guards directly throw built-in NestJS exceptions (`UnauthorizedException`, `ForbiddenException`).
   - **Recommendation**: Refactor error throwing in `AuthService` and guards to use these structured domain exceptions for consistent API error response envelopes.

3. **`src/authorization/authorization.service.ts`**
   - **Reason**: Contains helper methods `hasRole()`, `hasPermission()`, and `hasAllPermissions()`. However, `RolesGuard` and `PermissionsGuard` implement evaluation logic directly in their `canActivate` methods and do not inject `AuthorizationService`.
   - **Recommendation**: Inject `AuthorizationService` into `RolesGuard` and `PermissionsGuard` or utilize it in service-layer programmatic authorization.

4. **`src/users/users.service.ts`**
   - **Reason**: Provides `findById()`, `findByPhone()`, `findByEmail()`, and `findByIdentifier()`. `AuthService` and `JwtAuthGuard` execute queries directly against `PrismaService` instead of delegating to `UsersService`.
   - **Recommendation**: Inject `UsersService` into `AuthService` and `JwtAuthGuard` to centralize user entity lookups and profile population.

---

## 6. Duplicate or Redundant Implementations

1. **Provider Duplication in `TwoFactorModule`**:
   - `TwoFactorModule` declares `PasswordService` directly in its `providers` array:
     ```typescript
     @Module({
       providers: [TwoFactorService, PasswordService],
       exports: [TwoFactorService],
     })
     export class TwoFactorModule {}
     ```
     `PasswordService` is already provided and exported by `SecurityModule`. `TwoFactorModule` should import `SecurityModule` rather than re-providing `PasswordService`.
2. **Redundant Module Imports in `AppModule`**:
   - `AppModule` imports `SecurityModule`, `SessionsModule`, `OtpModule`, `TwoFactorModule`, `PasswordRecoveryModule`. These same modules are also imported by `AuthModule`. While harmless in NestJS, it represents minor registration redundancy.

---

## 7. Structural Integrity Verdict

- **Codebase Compile Status**: 0 TypeScript errors (`npx tsc --noEmit` exit code 0).
- **Test Suite Pass Rate**: 85/85 tests passing (11 test suites).
- **Empty Directories**: 5 directories remain as scaffolding artifacts from earlier planning phases (`src/auth/decorators/`, `src/auth/services/`, `src/auth/strategies/`, `src/authorization/policies/`, `src/common/guards/`).
- **All Required Business Logic**: Fully implemented and connected across the active domain structure.
