import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import {
  CartStatus,
  ProductStatus,
  StoreStatus,
  ParentOrderStatus,
  SubOrderStatus,
  OrderItemStatus,
  StockMovementType,
  ReservationStatus,
  Prisma,
} from '@prisma/client';
import crypto from 'node:crypto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly DEFAULT_COMMISSION_RATE = new Prisma.Decimal('0.0500'); // 5% marketplace commission

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Generates concurrency-safe, unique human-readable order numbers.
   * Format: SQ-YYYYMMDD-XXXXXX
   */
  private generateOrderNumber(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `SQ-${datePart}-${randPart}`;
  }

  /**
   * Generates concurrency-safe, unique human-readable suborder numbers.
   * Format: SQS-YYYYMMDD-XXXXXX
   */
  private generateSubOrderNumber(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `SQS-${datePart}-${randPart}`;
  }

  /**
   * Executes atomic multi-vendor checkout.
   */
  async checkout(userId: string, dto: CheckoutDto) {
    // 1. Resolve Customer Profile
    const customer = await this.prisma.customerProfile.findUnique({
      where: { userId },
      include: { addresses: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found for authenticated user.');
    }

    // 2. Idempotency Check
    const effectiveIdempotencyKey = dto.idempotencyKey?.trim() || null;
    if (effectiveIdempotencyKey) {
      const existingOrder = await this.findOrderByIdempotencyKey(customer.id, effectiveIdempotencyKey);
      if (existingOrder) {
        this.logger.log(`Idempotent checkout hit for key "${effectiveIdempotencyKey}" - returning existing order ${existingOrder.orderNumber}`);
        return this.formatOrderResponse(existingOrder);
      }
    }

    // 3. Retrieve Customer's Active Cart
    const cart = await this.prisma.cart.findFirst({
      where: { customerId: customer.id, status: CartStatus.ACTIVE },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    store: { include: { seller: { include: { user: true } } } },
                  },
                },
                inventoryItems: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cannot proceed to checkout. Your shopping cart is empty.');
    }

    // 4. Resolve Shipping Address Snapshot
    let shippingSnapshot: any;
    if (dto.shippingAddressId) {
      const addr = customer.addresses.find((a) => a.id === dto.shippingAddressId);
      if (!addr) {
        throw new BadRequestException(`Shipping address with ID "${dto.shippingAddressId}" does not belong to you.`);
      }
      shippingSnapshot = {
        addressId: addr.id,
        recipientName: addr.recipientName,
        phone: addr.phone,
        street: addr.street,
        city: addr.city,
        district: addr.district,
        landmark: addr.landmark,
        country: addr.country,
      };
    } else if (dto.shippingAddress) {
      shippingSnapshot = {
        recipientName: dto.shippingAddress.recipientName,
        phone: dto.shippingAddress.phone,
        street: dto.shippingAddress.street,
        city: dto.shippingAddress.city,
        district: dto.shippingAddress.district || null,
        landmark: dto.shippingAddress.landmark || null,
        country: 'Somalia',
      };
    } else {
      const defaultAddr = customer.addresses.find((a) => a.isDefaultShipping) || customer.addresses[0];
      if (defaultAddr) {
        shippingSnapshot = {
          addressId: defaultAddr.id,
          recipientName: defaultAddr.recipientName,
          phone: defaultAddr.phone,
          street: defaultAddr.street,
          city: defaultAddr.city,
          district: defaultAddr.district,
          landmark: defaultAddr.landmark,
          country: defaultAddr.country,
        };
      } else {
        throw new BadRequestException('A valid shipping address is required to place an order.');
      }
    }

    // Store idempotency key & notes in shippingAddressSnapshot for audit & idempotency lookups
    shippingSnapshot.idempotencyKey = effectiveIdempotencyKey;
    shippingSnapshot.customerNotes = dto.customerNotes || null;

    // 5. Pre-validate All Items, Stores & Stock
    // Group cart items by store
    const storeGroups = new Map<string, {
      storeId: string;
      sellerId: string;
      sellerUserId: string;
      items: typeof cart.items;
      subtotal: Prisma.Decimal;
    }>();

    for (const item of cart.items) {
      const { variant } = item;
      const { product } = variant;
      const { store } = product;

      // Status guards
      if (product.status !== ProductStatus.PUBLISHED) {
        throw new BadRequestException(`Product "${product.title}" is no longer available for purchase.`);
      }
      if (store.status !== StoreStatus.ACTIVE) {
        throw new BadRequestException(`Store "${store.name}" is currently inactive and cannot accept orders.`);
      }

      // Check stock availability
      const invItem = variant.inventoryItems.find((inv) => inv.storeId === store.id);
      const availableStock = invItem ? Math.max(0, invItem.quantityOnHand - invItem.reservedQuantity) : 0;
      if (availableStock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${variant.title}". Available: ${availableStock}, Requested: ${item.quantity}.`,
        );
      }

      // Price calculation using authoritative current variant price
      const currentPrice = new Prisma.Decimal(variant.price);
      const lineTotal = currentPrice.mul(item.quantity);

      if (!storeGroups.has(store.id)) {
        storeGroups.set(store.id, {
          storeId: store.id,
          sellerId: store.sellerId,
          sellerUserId: store.seller.userId,
          items: [],
          subtotal: new Prisma.Decimal(0),
        });
      }

      const group = storeGroups.get(store.id)!;
      group.items.push(item);
      group.subtotal = group.subtotal.add(lineTotal);
    }

    // Calculate Parent Order Totals
    let parentSubtotal = new Prisma.Decimal(0);
    for (const group of storeGroups.values()) {
      parentSubtotal = parentSubtotal.add(group.subtotal);
    }
    const deliveryFeeTotal = new Prisma.Decimal(0); // Phase 08 handles dynamic delivery calculation
    const taxTotal = new Prisma.Decimal(0);
    const discountTotal = new Prisma.Decimal(0);
    const grandTotal = parentSubtotal.add(deliveryFeeTotal).add(taxTotal).sub(discountTotal);

    // 6. Execute Atomic Transaction (Order + SubOrders + Items + Inventory Reservations)
    const orderNumber = this.generateOrderNumber();

    const createdOrder = await this.prisma.$transaction(
      async (tx) => {
        // Double-check idempotency inside transaction
        if (effectiveIdempotencyKey) {
          const duplicate = await tx.order.findFirst({
            where: {
              customerId: customer.id,
              shippingAddressSnapshot: { path: ['idempotencyKey'], equals: effectiveIdempotencyKey },
            },
            include: { subOrders: { include: { items: true } } },
          });
          if (duplicate) return duplicate;
        }

        // A. Create Parent Order
        const parentOrder = await tx.order.create({
          data: {
            orderNumber,
            customerId: customer.id,
            status: ParentOrderStatus.PENDING_PAYMENT,
            grossMerchandiseValue: grandTotal,
            subtotalAmount: parentSubtotal,
            deliveryFeeAmount: deliveryFeeTotal,
            taxAmount: taxTotal,
            discountAmount: discountTotal,
            totalPayable: grandTotal,
            currency: 'USD',
            shippingAddressSnapshot: shippingSnapshot,
          },
        });

        // B. Create SubOrders and OrderItems per participating store
        for (const group of storeGroups.values()) {
          const subOrderNumber = this.generateSubOrderNumber();
          const commissionAmount = group.subtotal.mul(this.DEFAULT_COMMISSION_RATE).toDecimalPlaces(2);
          const sellerPayableAmount = group.subtotal.sub(commissionAmount);

          const subOrder = await tx.subOrder.create({
            data: {
              subOrderNumber,
              parentOrderId: parentOrder.id,
              sellerId: group.sellerId,
              storeId: group.storeId,
              status: SubOrderStatus.PENDING_ACCEPTANCE,
              itemsSubtotal: group.subtotal,
              deliveryFee: new Prisma.Decimal(0),
              discountAmount: new Prisma.Decimal(0),
              totalAmount: group.subtotal,
              commissionRate: this.DEFAULT_COMMISSION_RATE,
              commissionAmount,
              sellerPayableAmount,
              currency: 'USD',
              customerNotes: dto.customerNotes || null,
            },
          });

          // C. Create Order Items & Reserve Inventory
          for (const item of group.items) {
            const { variant } = item;
            const currentPrice = new Prisma.Decimal(variant.price);
            const itemTotal = currentPrice.mul(item.quantity);
            const itemCommission = itemTotal.mul(this.DEFAULT_COMMISSION_RATE).toDecimalPlaces(2);
            const itemEarnings = itemTotal.sub(itemCommission);

            // Create OrderItem snapshot
            await tx.orderItem.create({
              data: {
                subOrderId: subOrder.id,
                sellerId: group.sellerId,
                productId: variant.productId,
                variantId: variant.id,
                status: OrderItemStatus.PENDING,
                productTitleSnapshot: variant.product.title,
                variantTitleSnapshot: variant.title,
                skuSnapshot: variant.sku,
                unitPrice: currentPrice,
                quantity: item.quantity,
                totalPrice: itemTotal,
                commissionRate: this.DEFAULT_COMMISSION_RATE,
                commissionAmount: itemCommission,
                sellerEarnings: itemEarnings,
              },
            });

            // Atomically reserve inventory
            const invItem = variant.inventoryItems.find((inv) => inv.storeId === group.storeId);
            if (invItem) {
              // Update InventoryItem reserved quantity
              await tx.inventoryItem.update({
                where: { id: invItem.id },
                data: {
                  reservedQuantity: { increment: item.quantity },
                },
              });

              // Create InventoryReservation record
              await tx.inventoryReservation.create({
                data: {
                  inventoryItemId: invItem.id,
                  variantId: variant.id,
                  orderId: parentOrder.id,
                  subOrderId: subOrder.id,
                  quantity: item.quantity,
                  status: ReservationStatus.ACTIVE,
                  expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30-minute hold
                },
              });

              // Record StockMovement audit entry
              await tx.stockMovement.create({
                data: {
                  inventoryItemId: invItem.id,
                  type: StockMovementType.PURCHASE_RESERVE,
                  quantityChange: -item.quantity,
                  quantityBefore: invItem.quantityOnHand,
                  quantityAfter: invItem.quantityOnHand,
                  referenceType: 'PARENT_ORDER',
                  referenceId: parentOrder.id,
                  notes: `Stock reserved for Order ${parentOrder.orderNumber} (SubOrder ${subOrder.subOrderNumber})`,
                  createdById: userId,
                },
              });
            }
          }
        }

        // D. Mark Cart as CHECKED_OUT and remove its items
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({
          where: { id: cart.id },
          data: { status: CartStatus.CHECKED_OUT },
        });

        // Load full newly created order for return
        return tx.order.findUnique({
          where: { id: parentOrder.id },
          include: {
            customer: true,
            subOrders: {
              include: {
                store: { select: { id: true, name: true, slug: true } },
                items: {
                  include: {
                    product: { select: { id: true, title: true, slug: true } },
                    variant: { select: { id: true, title: true, sku: true } },
                  },
                },
              },
            },
          },
        });
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // 7. Audit Log
    await this.auditLogsService.log({
      userId,
      action: 'ORDER_CHECKOUT_COMPLETED',
      entityName: 'Order',
      entityId: createdOrder!.id,
      newValues: {
        orderNumber: createdOrder!.orderNumber,
        totalPayable: createdOrder!.totalPayable,
        subOrdersCount: createdOrder!.subOrders.length,
      },
    });

    // 8. Dispatch Internal Notifications (Safely, outside transaction)
    try {
      await this.notificationsService.send({
        userId,
        title: 'Order Placed Successfully',
        body: `Your order #${createdOrder!.orderNumber} has been placed. Total: $${createdOrder!.totalPayable}.`,
        data: { orderId: createdOrder!.id, orderNumber: createdOrder!.orderNumber },
      });

      for (const group of storeGroups.values()) {
        await this.notificationsService.send({
          userId: group.sellerUserId,
          title: 'New Suborder Received',
          body: `You have received a new suborder for order #${createdOrder!.orderNumber}.`,
          data: { orderId: createdOrder!.id },
        });
      }
    } catch (notifErr) {
      this.logger.warn(`Failed to dispatch order notification: ${notifErr}`);
    }

    return this.formatOrderResponse(createdOrder);
  }

  /**
   * Helper to find an order by idempotencyKey stored in shippingAddressSnapshot.
   */
  private async findOrderByIdempotencyKey(customerId: string, idempotencyKey: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      include: {
        customer: true,
        subOrders: {
          include: {
            store: { select: { id: true, name: true, slug: true } },
            items: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return orders.find(
      (o) => (o.shippingAddressSnapshot as any)?.idempotencyKey === idempotencyKey,
    );
  }

  /**
   * Standardizes order response formatting.
   */
  private formatOrderResponse(order: any) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      grossMerchandiseValue: order.grossMerchandiseValue,
      subtotalAmount: order.subtotalAmount,
      deliveryFeeAmount: order.deliveryFeeAmount,
      discountAmount: order.discountAmount,
      totalPayable: order.totalPayable,
      totalAmount: order.totalPayable,
      currency: order.currency,
      shippingAddress: order.shippingAddressSnapshot,
      createdAt: order.createdAt,
      subOrders: order.subOrders.map((sub: any) => ({
        id: sub.id,
        subOrderNumber: sub.subOrderNumber,
        storeId: sub.storeId,
        store: sub.store || { id: sub.storeId, name: sub.storeName, slug: sub.storeSlug },
        storeName: sub.store?.name,
        storeSlug: sub.store?.slug,
        sellerId: sub.sellerId,
        status: sub.status,
        itemsSubtotal: sub.itemsSubtotal,
        deliveryFee: sub.deliveryFee,
        discountAmount: sub.discountAmount,
        totalAmount: sub.totalAmount,
        commissionRate: sub.commissionRate,
        commissionAmount: sub.commissionAmount,
        sellerPayableAmount: sub.sellerPayableAmount,
        customerNotes: sub.customerNotes,
        sellerNotes: sub.sellerNotes,
        confirmedAt: sub.confirmedAt,
        cancelledAt: sub.cancelledAt,
        items: sub.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productTitleSnapshot: item.productTitleSnapshot,
          variantTitleSnapshot: item.variantTitleSnapshot,
          skuSnapshot: item.skuSnapshot,
          productTitle: item.productTitleSnapshot,
          variantTitle: item.variantTitleSnapshot,
          sku: item.skuSnapshot,
          unitPriceSnapshot: item.unitPrice,
          totalPriceSnapshot: item.totalPrice,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          status: item.status,
        })),
      })),
    };
  }
}
