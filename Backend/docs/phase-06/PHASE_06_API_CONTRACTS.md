# SUUQZO MALL — PHASE 06 API CONTRACTS SPECIFICATION

---

## 1. Shopping Cart Endpoints

### 1.1 Add Item to Cart
- **Endpoint**: `POST /api/v1/cart/items`
- **Auth**: Bearer Token (`CUSTOMER`)
- **Body**:
```json
{
  "variantId": "cuid_variant_id",
  "quantity": 2
}
```
- **Response** (`200 OK` / `201 Created`):
```json
{
  "cartId": "cart_cuid",
  "customerId": "cust_cuid",
  "currency": "USD",
  "totalItemsCount": 2,
  "grandSubtotal": "90.00",
  "stores": [
    {
      "store": {
        "id": "store_cuid",
        "name": "Banaadir Electronics",
        "slug": "banaadir-electronics",
        "status": "ACTIVE"
      },
      "items": [
        {
          "id": "item_cuid",
          "variantId": "variant_cuid",
          "productTitle": "iPhone 15 Case",
          "variantTitle": "Black / Silicone",
          "sku": "IPH15-BLK-SIL",
          "quantity": 2,
          "unitPrice": "45.00",
          "lineTotal": "90.00",
          "availableStock": 20,
          "isAvailable": true
        }
      ],
      "subtotal": "90.00"
    }
  ]
}
```

### 1.2 Get Active Cart
- **Endpoint**: `GET /api/v1/cart`
- **Auth**: Bearer Token (`CUSTOMER`)
- **Response** (`200 OK`): Full cart object grouped by store with live available inventory checks.

### 1.3 Update Cart Item Quantity
- **Endpoint**: `PATCH /api/v1/cart/items/:itemId`
- **Auth**: Bearer Token (`CUSTOMER`)
- **Body**:
```json
{
  "quantity": 4
}
```
- **Response** (`200 OK`): Updated cart object.

### 1.4 Remove Item from Cart
- **Endpoint**: `DELETE /api/v1/cart/items/:itemId`
- **Auth**: Bearer Token (`CUSTOMER`)
- **Response** (`200 OK`):
```json
{
  "message": "Item removed from cart successfully."
}
```

### 1.5 Clear Entire Cart
- **Endpoint**: `DELETE /api/v1/cart`
- **Auth**: Bearer Token (`CUSTOMER`)
- **Response** (`200 OK`):
```json
{
  "message": "Cart cleared successfully."
}
```

---

## 2. Multi-Vendor Checkout Endpoint

### 2.1 Checkout Cart
- **Endpoint**: `POST /api/v1/checkout`
- **Auth**: Bearer Token (`CUSTOMER`)
- **Body**:
```json
{
  "idempotencyKey": "uuid_or_custom_key_12345",
  "shippingAddress": {
    "recipientName": "Ali Hassan",
    "phone": "+252615000000",
    "street": "Maka Al Mukarama",
    "city": "Mogadishu",
    "district": "Hodan",
    "landmark": "Near Banadir Hospital"
  },
  "customerNotes": "Please call before arrival"
}
```
- **Response** (`201 Created`):
```json
{
  "id": "ord_cuid_123",
  "orderNumber": "SQ-20261124-B1F93A",
  "status": "PENDING_PAYMENT",
  "grossMerchandiseValue": "360.00",
  "subtotalAmount": "360.00",
  "deliveryFeeAmount": "0.00",
  "discountAmount": "0.00",
  "totalPayable": "360.00",
  "totalAmount": "360.00",
  "currency": "USD",
  "shippingAddress": {
    "recipientName": "Ali Hassan",
    "phone": "+252615000000",
    "street": "Maka Al Mukarama",
    "city": "Mogadishu",
    "district": "Hodan",
    "idempotencyKey": "uuid_or_custom_key_12345"
  },
  "subOrders": [
    {
      "id": "sub_cuid_1",
      "subOrderNumber": "SQS-20261124-78A1D4",
      "storeId": "store_cuid_1",
      "store": {
        "id": "store_cuid_1",
        "name": "Banaadir Electronics",
        "slug": "banaadir-electronics"
      },
      "status": "PENDING_ACCEPTANCE",
      "itemsSubtotal": "180.00",
      "deliveryFee": "0.00",
      "totalAmount": "180.00",
      "commissionRate": "0.0500",
      "commissionAmount": "9.00",
      "sellerPayableAmount": "171.00",
      "items": [
        {
          "id": "item_cuid_1",
          "productId": "prod_cuid",
          "variantId": "var_cuid",
          "productTitleSnapshot": "iPhone 15 Case",
          "skuSnapshot": "IPH15-BLK",
          "unitPriceSnapshot": "90.00",
          "quantity": 2,
          "totalPriceSnapshot": "180.00"
        }
      ]
    }
  ]
}
```

---

## 3. Order Management Endpoints

### 3.1 Customer Endpoints (`/api/v1/orders`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/orders` | `CUSTOMER` | List customer's orders (paginated, status filter) |
| `GET` | `/api/v1/orders/:id` | `CUSTOMER` | Get single customer order details |
| `POST` | `/api/v1/orders/:id/cancel` | `CUSTOMER` | Request cancellation of unfulfilled order |
| `GET` | `/api/v1/orders/:id/tracking` | `CUSTOMER` | Live suborder tracking across stores |

### 3.2 Seller Endpoints (`/api/v1/seller/orders`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/seller/orders` | `SELLER` | List suborders for seller's stores |
| `GET` | `/api/v1/seller/orders/:id` | `SELLER` | Get suborder details (store-isolated) |
| `PATCH` | `/api/v1/seller/orders/:id/status` | `SELLER` | Advance suborder status (`CONFIRMED`, `PROCESSING_PACKING`, `READY_FOR_PICKUP`) |
| `POST` | `/api/v1/seller/orders/:id/reject` | `SELLER` | Reject/cancel suborder and release stock |

### 3.3 Admin Endpoints (`/api/v1/admin/orders`)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/orders` | `ADMIN`, `SUPER_ADMIN` | List all orders across all tenants |
| `GET` | `/api/v1/admin/orders/:id` | `ADMIN`, `SUPER_ADMIN` | Get order details with audit trail |
| `PATCH` | `/api/v1/admin/orders/:id/status` | `ADMIN`, `SUPER_ADMIN` | Manually update order status (e.g. confirm payment) |
| `POST` | `/api/v1/admin/orders/:id/cancel` | `ADMIN`, `SUPER_ADMIN` | Admin override cancellation (releases stock) |
