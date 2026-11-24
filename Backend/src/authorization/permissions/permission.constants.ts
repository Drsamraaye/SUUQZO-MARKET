/**
 * All system permission constants used by @RequirePermissions() decorator.
 * Format: '<domain>.<resource>.<action>'
 */
export const PERMISSIONS = {
  // User management
  ADMIN_USERS_VIEW: 'admin.users.view',
  ADMIN_USERS_CREATE: 'admin.users.create',
  ADMIN_USERS_EDIT: 'admin.users.edit',
  ADMIN_USERS_DELETE: 'admin.users.delete',
  ADMIN_USERS_SUSPEND: 'admin.users.suspend',
  ADMIN_USERS_BAN: 'admin.users.ban',
  ADMIN_USERS_ROLES: 'admin.users.roles',

  // Seller management
  ADMIN_SELLERS_VIEW: 'admin.sellers.view',
  ADMIN_SELLERS_REVIEW: 'admin.sellers.review',
  ADMIN_SELLERS_APPROVE: 'admin.sellers.approve',
  ADMIN_SELLERS_REJECT: 'admin.sellers.reject',
  ADMIN_SELLERS_SUSPEND: 'admin.sellers.suspend',
  ADMIN_SELLERS_DOCS_VIEW: 'admin.sellers.docs.view',

  // Store management
  ADMIN_STORES_VIEW: 'admin.stores.view',
  ADMIN_STORES_REVIEW: 'admin.stores.review',
  ADMIN_STORES_APPROVE: 'admin.stores.approve',
  ADMIN_STORES_SUSPEND: 'admin.stores.suspend',

  // Orders
  ADMIN_ORDERS_VIEW: 'admin.orders.view',
  ADMIN_ORDERS_MANAGE: 'admin.orders.manage',
  ADMIN_ORDERS_REFUND: 'admin.orders.refund',

  // Products & Categories
  ADMIN_PRODUCTS_VIEW: 'admin.products.view',
  ADMIN_PRODUCTS_APPROVE: 'admin.products.approve',
  ADMIN_PRODUCTS_EDIT: 'admin.products.edit',
  ADMIN_PRODUCTS_DELETE: 'admin.products.delete',
  ADMIN_CATEGORIES_MANAGE: 'admin.categories.manage',

  // Inventory
  ADMIN_INVENTORY_VIEW: 'admin.inventory.view',
  ADMIN_INVENTORY_MANAGE: 'admin.inventory.manage',

  // Payments
  ADMIN_PAYMENTS_VIEW: 'admin.payments.view',
  ADMIN_PAYMENTS_MANAGE: 'admin.payments.manage',

  // Payouts
  ADMIN_PAYOUTS_VIEW: 'admin.payouts.view',
  ADMIN_PAYOUTS_APPROVE: 'admin.payouts.approve',

  // Disputes
  ADMIN_DISPUTES_VIEW: 'admin.disputes.view',
  ADMIN_DISPUTES_RESOLVE: 'admin.disputes.resolve',

  // Platform config
  ADMIN_CONFIG_VIEW: 'admin.config.view',
  ADMIN_CONFIG_EDIT: 'admin.config.edit',

  // Audit logs
  ADMIN_AUDIT_VIEW: 'admin.audit.view',

  // Roles and permissions
  ADMIN_ROLES_VIEW: 'admin.roles.view',
  ADMIN_ROLES_EDIT: 'admin.roles.edit',

  // Reports
  ADMIN_REPORTS_VIEW: 'admin.reports.view',
  ADMIN_REPORTS_EXPORT: 'admin.reports.export',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
