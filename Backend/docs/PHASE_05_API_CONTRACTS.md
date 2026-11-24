# SUUQZO MALL — PHASE 05 API CONTRACTS
## Product, Category, Brand & Inventory Management

All endpoints are hosted under `/api/v1/`.

---

### 1. Categories Endpoints (`/api/v1/categories`)

#### 1.1 `GET /api/v1/categories`
- **Access**: Public (`@Public()`)
- **Query**: `tree` (boolean), `parentId` (string), `search` (string)
- **Response**: Array of active categories (nested tree when `tree=true`).

#### 1.2 `GET /api/v1/categories/slug/:slug`
- **Access**: Public (`@Public()`)
- **Response**: Category object with active children and product count.

#### 1.3 `POST /api/v1/categories`
- **Access**: Admin (`admin.categories.manage`)
- **Request Body**:
  ```json
  {
    "name": "Smartphones",
    "slug": "smartphones",
    "parentId": "cm4cat0001",
    "description": "Mobile devices and smartphones",
    "iconUrl": "https://storage.suuqzo.test/categories/phone.svg",
    "displayOrder": 1,
    "commissionRateOverride": 0.04
  }
  ```
- **Response**: 201 Created with created Category.

#### 1.4 `PATCH /api/v1/categories/:id`
- **Access**: Admin (`admin.categories.manage`)
- **Request Body**: Partial update. Prevents circular hierarchy.

#### 1.5 `DELETE /api/v1/categories/:id`
- **Access**: Admin (`admin.categories.manage`)
- **Response**: 200 OK. Fails if category has associated products or child categories.

---

### 2. Brands Endpoints (`/api/v1/brands`)

#### 2.1 `GET /api/v1/brands`
- **Access**: Public (`@Public()`)
- **Response**: Array of brands with product counts.

#### 2.2 `POST /api/v1/brands`
- **Access**: Admin (`admin.products.edit`)
- **Request Body**:
  ```json
  {
    "name": "Apple",
    "slug": "apple",
    "logoUrl": "https://storage.suuqzo.test/brands/apple.png"
  }
  ```

---

### 3. Products Endpoints (`/api/v1/products`)

#### 3.1 `GET /api/v1/products`
- **Access**: Public (`@Public()`)
- **Query**:
  - `page` (number, default: 1)
  - `limit` (number, default: 20)
  - `search` (string)
  - `categoryId` (string)
  - `brandId` (string)
  - `storeId` (string)
  - `minPrice` / `maxPrice` (number)
  - `inStock` (boolean)
  - `sortBy` (`price_asc` | `price_desc` | `newest` | `rating` | `popular`)
- **Response**: Paginated published products from active stores.

#### 3.2 `GET /api/v1/products/:storeSlug/:productSlug`
- **Access**: Public (`@Public()`)
- **Response**: Full published product with variants and images.

#### 3.3 `POST /api/v1/products`
- **Access**: `SELLER`, `ADMIN`, `SUPER_ADMIN` (Store ownership strictly enforced)
- **Request Body**:
  ```json
  {
    "storeId": "cm4store0001",
    "categoryId": "cm4cat0001",
    "brandId": "cm4brand0001",
    "title": "MacBook Pro M3",
    "slug": "macbook-pro-m3",
    "description": "Apple Silicon M3 Laptop",
    "basePrice": 1599.99,
    "compareAtPrice": 1799.99,
    "variants": [
      {
        "title": "16GB RAM / 512GB SSD",
        "sku": "MBP-M3-16-512",
        "price": 1599.99,
        "attributes": { "ram": "16GB", "storage": "512GB" },
        "initialStock": 10
      }
    ],
    "images": [
      {
        "url": "https://storage.suuqzo.test/products/mbp1.jpg",
        "isPrimary": true,
        "sortOrder": 0
      }
    ]
  }
  ```
- **Response**: 201 Created with product in `DRAFT` status.

#### 3.4 `PATCH /api/v1/products/:id`
- **Access**: Product Owner or Admin
- **Request Body**: Partial update. Sellers cannot set status directly to `PUBLISHED`.

#### 3.5 `POST /api/v1/products/:id/submit-review`
- **Access**: Product Owner
- **Response**: Updates status to `PENDING_REVIEW`. Requires at least 1 variant and 1 image.

#### 3.6 `PATCH /api/v1/products/:id/moderate`
- **Access**: Admin (`admin.products.approve`)
- **Anti-Conflict**: Self-approval throws `HTTP 403 Forbidden`.
- **Request Body**:
  ```json
  {
    "action": "APPROVE",
    "reason": "All specifications verified against official documentation."
  }
  ```

#### 3.7 `DELETE /api/v1/products/:id`
- **Access**: Product Owner or Admin
- **Response**: Sets product status to `ARCHIVED`.

---

### 4. Inventory Endpoints (`/api/v1/inventory`)

#### 4.1 `GET /api/v1/inventory/availability/:variantId/:storeId`
- **Access**: Public (`@Public()`)
- **Response**:
  ```json
  {
    "variantId": "cm4var0001",
    "storeId": "cm4store0001",
    "quantityOnHand": 25,
    "reservedQuantity": 2,
    "availableQuantity": 23,
    "isInStock": true
  }
  ```

#### 4.2 `POST /api/v1/inventory/adjust`
- **Access**: Store Owner or Admin
- **Request Body**:
  ```json
  {
    "variantId": "cm4var0001",
    "storeId": "cm4store0001",
    "quantityChange": 20,
    "type": "RESTOCK",
    "notes": "Weekly inventory restock from port warehouse",
    "lowStockThreshold": 5
  }
  ```
- **Response**: 200 OK with updated InventoryItem and created StockMovement. Fails if resulting stock is negative.
