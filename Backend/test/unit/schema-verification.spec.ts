import { describe, it, expect } from 'vitest';
import { PrismaClient, Prisma, PaymentMethod, UserRole, SubOrderStatus, PayoutMethodType, LedgerAccountType } from '@prisma/client';

describe('Prisma Schema Marketplace Coverage', () => {
  it('should expose all 21 domain models in Prisma Client ModelName', () => {
    const modelNames = Object.values(Prisma.ModelName);

    // 1. Identity & Auth
    expect(modelNames).toContain('User');
    expect(modelNames).toContain('UserSession');
    expect(modelNames).toContain('RefreshToken');

    // 2. Customer Management
    expect(modelNames).toContain('CustomerProfile');
    expect(modelNames).toContain('CustomerAddress');

    // 3. Seller Management
    expect(modelNames).toContain('SellerProfile');
    expect(modelNames).toContain('SellerKycDocument');

    // 4. Store Management
    expect(modelNames).toContain('Store');

    // 5. Rider Management
    expect(modelNames).toContain('RiderProfile');

    // 6. Product Catalog
    expect(modelNames).toContain('Category');
    expect(modelNames).toContain('Brand');
    expect(modelNames).toContain('Product');
    expect(modelNames).toContain('ProductVariant');
    expect(modelNames).toContain('ProductImage');

    // 7. Inventory Management
    expect(modelNames).toContain('InventoryItem');
    expect(modelNames).toContain('InventoryReservation');
    expect(modelNames).toContain('StockMovement');

    // 8. Cart and Checkout
    expect(modelNames).toContain('Cart');
    expect(modelNames).toContain('CartItem');
    expect(modelNames).toContain('CheckoutSession');

    // 9. Parent Orders and Seller Suborders
    expect(modelNames).toContain('Order');
    expect(modelNames).toContain('SubOrder');
    expect(modelNames).toContain('OrderItem');

    // 10. Delivery Management
    expect(modelNames).toContain('DeliveryAssignment');
    expect(modelNames).toContain('DeliveryTrackingUpdate');

    // 11. Payment Processing
    expect(modelNames).toContain('Payment');
    expect(modelNames).toContain('PaymentTransaction');
    expect(modelNames).toContain('ProviderWebhookEvent');

    // 12. Financial Ledger and Accounting
    expect(modelNames).toContain('LedgerAccount');
    expect(modelNames).toContain('LedgerTransaction');
    expect(modelNames).toContain('LedgerEntry');

    // 13. Commission and Seller Payouts
    expect(modelNames).toContain('PayoutBatch');
    expect(modelNames).toContain('SellerPayout');

    // 14. Refunds, Returns and Disputes
    expect(modelNames).toContain('Refund');
    expect(modelNames).toContain('ReturnRequest');
    expect(modelNames).toContain('ReturnItem');
    expect(modelNames).toContain('Dispute');

    // 15. Wallet Management
    expect(modelNames).toContain('Wallet');
    expect(modelNames).toContain('WalletTransaction');

    // 16. Promotions, Coupons and Campaigns
    expect(modelNames).toContain('Campaign');
    expect(modelNames).toContain('Coupon');
    expect(modelNames).toContain('CouponUsage');

    // 17. Reviews and Ratings
    expect(modelNames).toContain('ProductReview');
    expect(modelNames).toContain('StoreReview');
    expect(modelNames).toContain('RiderReview');

    // 18. Notifications and Messaging
    expect(modelNames).toContain('Notification');
    expect(modelNames).toContain('Conversation');
    expect(modelNames).toContain('Message');

    // 19. Support and Customer Service
    expect(modelNames).toContain('SupportTicket');
    expect(modelNames).toContain('TicketMessage');

    // 20. Administration and Audit Logging
    expect(modelNames).toContain('AdminProfile');
    expect(modelNames).toContain('AuditLog');

    // 21. Platform Configuration and Integrations
    expect(modelNames).toContain('PlatformSetting');
    expect(modelNames).toContain('IntegrationConfig');
  });

  it('should support all required payment methods including Somali local payment rails', () => {
    expect(PaymentMethod.ZAAD).toBe('ZAAD');
    expect(PaymentMethod.EVC_PLUS).toBe('EVC_PLUS');
    expect(PaymentMethod.EDAHAB).toBe('EDAHAB');
    expect(PaymentMethod.BANK_TRANSFER).toBe('BANK_TRANSFER');
    expect(PaymentMethod.CASH_ON_DELIVERY).toBe('CASH_ON_DELIVERY');
    expect(PaymentMethod.PREMIER_WALLET).toBe('PREMIER_WALLET');
  });

  it('should support required payout methods', () => {
    expect(PayoutMethodType.ZAAD).toBe('ZAAD');
    expect(PayoutMethodType.EVC_PLUS).toBe('EVC_PLUS');
    expect(PayoutMethodType.EDAHAB).toBe('EDAHAB');
    expect(PayoutMethodType.BANK_TRANSFER).toBe('BANK_TRANSFER');
    expect(PayoutMethodType.PREMIER_WALLET).toBe('PREMIER_WALLET');
  });

  it('should support double-entry ledger account types', () => {
    expect(LedgerAccountType.ASSET).toBe('ASSET');
    expect(LedgerAccountType.LIABILITY).toBe('LIABILITY');
    expect(LedgerAccountType.REVENUE).toBe('REVENUE');
    expect(LedgerAccountType.EXPENSE).toBe('EXPENSE');
    expect(LedgerAccountType.EQUITY).toBe('EQUITY');
  });
});
