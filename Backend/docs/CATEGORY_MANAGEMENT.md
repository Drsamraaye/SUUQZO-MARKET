# SUUQZO MALL — CATEGORY MANAGEMENT
## Phase 05 Technical Specification

### 1. Hierarchy & Relational Model

The SUUQZO MALL Category Taxonomy implements a self-referencing tree structure (`CategoryHierarchy`) with automated depth levels:

```
[ Electronics (Level 1) ]
       │
       ▼ parentId
[ Phones & Tablets (Level 2) ]
       │
       ▼ parentId
[ Smartphones (Level 3) ]
```

```prisma
model Category {
  id                     String     @id @default(cuid())
  parentId               String?
  name                   String
  slug                   String     @unique
  description            String?
  iconUrl                String?
  bannerUrl              String?
  level                  Int        @default(1)
  displayOrder           Int        @default(0)
  commissionRateOverride Decimal?   @db.Decimal(5, 4)
  isActive               Boolean    @default(true)
  createdAt              DateTime   @default(now())
  updatedAt              DateTime   @updatedAt

  parent                 Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children               Category[] @relation("CategoryHierarchy")
  products               Product[]

  @@index([parentId])
  @@index([slug])
}
```

---

### 2. Circular Relationship Prevention

To guarantee acyclic category hierarchies, the system enforces strict tree validation on every create or update operation:

```typescript
private async assertNoCycle(categoryId: string, targetParentId: string): Promise<void> {
  if (categoryId === targetParentId) {
    throw new BadRequestException('A category cannot be its own parent.');
  }

  let currentParentId: string | null = targetParentId;
  const visited = new Set<string>();

  while (currentParentId) {
    if (currentParentId === categoryId) {
      throw new BadRequestException(
        'Circular hierarchy detected. A category cannot have one of its descendants as its parent.',
      );
    }
    if (visited.has(currentParentId)) break;
    visited.add(currentParentId);

    const parent = await this.prisma.category.findUnique({
      where: { id: currentParentId },
      select: { parentId: true },
    });
    currentParentId = parent?.parentId || null;
  }
}
```

---

### 3. Deletion & Referential Integrity

Direct deletion of active taxonomy categories is governed by safety barriers:
1. **Product Protection**: If `category._count.products > 0`, deletion is blocked (`HTTP 400 Bad Request`). Vendors must re-categorize products or admins must deactivate the category instead.
2. **Sub-Category Protection**: If `category._count.children > 0`, deletion is blocked until child sub-categories are reassigned.
3. **Audit Trail**: Successful category creation, updates, and deletions are recorded in `AuditLog`.

---

### 4. Public Discovery vs Admin Control

- **Public Access**:
  - `GET /api/v1/categories`: Flat list of active categories.
  - `GET /api/v1/categories?tree=true`: Multi-level nested tree of active categories for storefront navigation.
  - `GET /api/v1/categories/slug/:slug`: Category metadata with active child subcategories and product count.
- **Admin Access**:
  - `GET /api/v1/categories/admin/all`: Complete taxonomy inspection including inactive nodes.
  - `POST /api/v1/categories`: Create category (`admin.categories.manage`).
  - `PATCH /api/v1/categories/:id`: Update category (`admin.categories.manage`).
  - `DELETE /api/v1/categories/:id`: Delete leaf category (`admin.categories.manage`).
