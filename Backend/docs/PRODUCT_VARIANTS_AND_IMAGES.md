# SUUQZO MALL — PRODUCT VARIANTS AND IMAGES
## Phase 05 Technical Specification

### 1. Product Variant Architecture

Modern e-commerce requires flexible SKUs with distinct options (size, color, capacity) while maintaining centralized product identity:

```prisma
model ProductVariant {
  id             String                @id @default(cuid())
  productId      String
  sku            String                @unique
  barcode        String?
  title          String
  price          Decimal               @db.Decimal(12, 2)
  compareAtPrice Decimal?              @db.Decimal(12, 2)
  attributes     Json
  weightKg       Decimal?              @db.Decimal(8, 3)
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  product        Product               @relation(fields: [productId], references: [id], onDelete: Cascade)
  inventoryItems InventoryItem[]
  images         ProductImage[]

  @@index([productId])
  @@index([sku])
}
```

#### 1.1 Global SKU Uniqueness
- Every variant has a mandatory globally unique Stock Keeping Unit (`sku`).
- Conflict detection blocks duplicate SKUs across vendors and stores.
- If omitted during creation, an auto-generated SKU format is applied: `<PRODUCT_SLUG>-VAR-<INDEX>-<RANDOM_HEX>`.

#### 1.2 Polymorphic Attributes
- Stored as structured JSON (`attributes: { "size": "XL", "color": "Blue", "model": "Pro" }`).
- Facilitates fast customer option selection without complex relational joins.

---

### 2. Product Image Management

```prisma
model ProductImage {
  id        String          @id @default(cuid())
  productId String
  variantId String?
  url       String
  altText   String?
  sortOrder Int             @default(0)
  isPrimary Boolean         @default(false)
  createdAt DateTime        @default(now())

  product   Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant   ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)

  @@index([productId, sortOrder])
}
```

#### 2.1 Storage Provider Abstraction & URL Ingestion
- Image binary blobs are **never stored directly inside PostgreSQL**.
- Media assets are uploaded to cloud object storage (S3 / Cloudflare R2 / Supabase Storage).
- URLs must conform to valid HTTP/HTTPS schemes. Data URIs or executable payloads are rejected.

#### 2.2 Image Ordering & Primary Image Designation
- `sortOrder`: Integer controlling presentation sequence in the product gallery.
- `isPrimary`: Exactly one primary thumbnail image is designated per product. If none is marked, the first uploaded image automatically receives primary status.
- Optional `variantId` links color-specific images directly to specific SKU variants.
