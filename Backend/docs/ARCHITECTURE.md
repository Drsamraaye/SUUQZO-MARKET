# SUUQZO MALL – Backend Architecture Decision Record (ADR)

## Status
**ACCEPTED & PERMANENT** (Mandatory Project Standard)

---

## 1. Context & Architectural Decision
The root project directory for the SUUQZO project is `SUUQZO-MALL`. 

To maintain clean separation of concerns, enable independent deployments, support multi-platform monorepo or polyrepo setups (web frontends, mobile applications, admin panels), and avoid configuration bleed, the backend application is strictly isolated into a single dedicated directory named exactly:

```text
Backend/
```

This decision is mandatory across all phases and all contributors.

---

## 2. Mandatory Rules

1. **NestJS Source Code**: All NestJS source code MUST reside exclusively inside `Backend/src/`.
2. **Database & ORM**: All Prisma schemas, migrations, seed runners, and seed data files MUST reside inside `Backend/prisma/`.
3. **Tests**: All backend unit, integration, e2e, security tests, and fixtures MUST reside inside `Backend/test/` (or co-located spec files inside `Backend/src/` as per NestJS conventions).
4. **Documentation**: All backend-specific architecture documents, API specs, database diagrams, workflow documentation, and QA checklists MUST reside inside `Backend/docs/`.
5. **Scripts**: All backend automation, deployment, database management, and maintenance scripts MUST reside inside `Backend/scripts/`.
6. **Dependencies & Manifests**: All backend package manifests (`package.json`, `package-lock.json`, etc.) MUST reside inside `Backend/`.
7. **Environment Configuration**: All backend environment templates and files (`.env`, `.env.example`, `.env.test`) MUST reside inside `Backend/`.
8. **Tooling & Compiler Configurations**: All backend configuration files (`tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.prettierrc`, linter configurations, vitest/jest configurations) MUST reside inside `Backend/`.
9. **Docker & Containerization**: All backend Dockerfiles, docker-compose services, and container configurations MUST reside inside `Backend/`.
10. **Generated Artifacts**: All backend-related build outputs, coverage reports, and generated artifacts (`dist/`, `coverage/`) MUST remain inside `Backend/`, except explicitly approved repository-level CI/CD pipelines.

---

## 3. Forbidden Actions

- ❌ **DO NOT** initialize or create a backend project in the SUUQZO-MALL root directory.
- ❌ **DO NOT** create alternate folders such as `backend`, `api`, `server`, or `app` for this backend application.
- ❌ **DO NOT** place NestJS source files inside frontend or client application folders.
- ❌ **DO NOT** move or mix frontend files into `Backend/`.
- ❌ **DO NOT** duplicate backend configurations outside `Backend/`.
- ❌ **DO NOT** alter the exact casing of the folder name `Backend`.

---

## 4. Target Backend File Architecture

```text
Backend/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   ├── seed.ts
│   └── seeds/
│       ├── roles.seed.ts
│       ├── permissions.seed.ts
│       ├── categories.seed.ts
│       └── admin.seed.ts
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│
│   ├── config/
│   │   ├── configuration.ts
│   │   ├── validation.schema.ts
│   │   └── configuration.module.ts
│
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│
│   ├── common/
│   │   ├── decorators/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── filters/
│   │   ├── pipes/
│   │   ├── dto/
│   │   ├── enums/
│   │   ├── interfaces/
│   │   ├── constants/
│   │   ├── utils/
│   │   └── types/
│
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   ├── guards/
│   │   ├── decorators/
│   │   └── dto/
│
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   └── dto/
│
│   ├── permissions/
│   │   ├── permissions.module.ts
│   │   ├── permissions.service.ts
│   │   ├── roles/
│   │   ├── guards/
│   │   └── decorators/
│
│   ├── customers/
│   ├── sellers/
│   ├── stores/
│   ├── riders/
│   ├── catalog/
│   ├── categories/
│   ├── products/
│   ├── inventory/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   ├── delivery/
│   ├── payments/
│   ├── finance/
│   ├── payouts/
│   ├── refunds/
│   ├── notifications/
│   ├── messaging/
│   ├── reviews/
│   ├── promotions/
│   ├── coupons/
│   ├── banners/
│   ├── support/
│   ├── analytics/
│   ├── admin/
│   ├── storage/
│   ├── integrations/
│   ├── audit-logs/
│   └── health/
│
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── fixtures/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── workflows/
│   ├── decisions/
│   └── QA/
│
├── scripts/
├── .env.example
├── .gitignore
├── .prettierrc
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
└── Dockerfile
```

> **Implementation Note**: Feature modules will be implemented with their respective controllers, services, repositories, DTOs, tests, and module definitions in their designated phases. Empty placeholder files will not be created ahead of actual implementation.

---

## 5. Verification Checklist

- [x] SUUQZO-MALL root directory confirmed (`c:\SUUQZO MARKET`).
- [x] Dedicated `Backend/` directory created with exact casing.
- [x] NestJS application initialized directly in `Backend/`.
- [x] `package.json`, `tsconfig.json`, and source code located strictly inside `Backend/`.
- [x] Application successfully built and tested (`npm run build` and `npm run test` passing).
- [x] Architectural decision permanently recorded in `Backend/docs/ARCHITECTURE.md`.
