import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { QueryOrdersDto } from './dto/query-orders.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { UpdateSubOrderStatusDto } from './dto/update-suborder-status.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import {
  ParentOrderStatus,
  SubOrderStatus,
  ReservationStatus,
  StockMovementType,
  UserRole,
} from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // =========================================================================
  // CUSTOMER ORDER OPERATIONS
  // =========================================================================

  /**
   * Lists customer's orders with pagination and filtering.
   */
  async findCustomerOrders(userId: string, query: QueryOrdersDto) {
    const customer = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });
    if (!customer) {
      return { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { customerId: customer.id };
    if (query.status && Object.values(ParentOrderStatus).includes(query.status as any)) {
      where.status = query.status as ParentOrderStatus;
    }
    if (query.search) {
      where.orderNumber = { contains: query.search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subOrders: {
            select: {
              id: true,
              subOrderNumber: true,
              status: true,
              totalAmount: true,
              store: { select: { id: true, name: true, slug: true } },
              _count: { select: { items: true } },
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single order details for authenticated customer with IDOR protection.
   */
  async findCustomerOrderById(userId: string, orderId: string) {
    const customer = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });
    if (!customer) throw new NotFoundException('Customer profile not found.');

    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        subOrders: {
          include: {
            store: { select: { id: true, name: true, slug: true, logoUrl: true } },
            items: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found.`);
    }

    if (order.customerId !== customer.id) {
      throw new ForbiddenException('Access denied. You can only view your own orders.');
    }

    return order;
  }

  /**
   * Customer cancels their own order if eligible, atomically releasing reserved stock.
   */
  async cancelCustomerOrder(userId: string, orderId: string, dto: CancelOrderDto) {
    const customer = await this.prisma.customerProfile.findUnique({
      where: { userId },
    });
    if (!customer) throw new NotFoundException('Customer profile not found.');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { subOrders: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found.`);
    }

    if (order.customerId !== customer.id) {
      throw new ForbiddenException('Access denied. You can only cancel your own orders.');
    }

    // Cancellation eligibility rule:
    // Order must not already be CANCELLED or DELIVERED.
    // Suborders must not have advanced to PROCESSING_PACKING, OUT_FOR_DELIVERY, or DELIVERED.
    if (order.status === ParentOrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled.');
    }

    const unCancellableStatuses: SubOrderStatus[] = [
      SubOrderStatus.PROCESSING_PACKING,
      SubOrderStatus.READY_FOR_PICKUP,
      SubOrderStatus.ASSIGNED_FOR_DELIVERY,
      SubOrderStatus.OUT_FOR_DELIVERY,
      SubOrderStatus.DELIVERED,
    ];

    const hasStartedFulfillment = order.subOrders.some((sub) =>
      unCancellableStatuses.includes(sub.status),
    );

    if (hasStartedFulfillment) {
      throw new BadRequestException(
        'Cannot cancel order. One or more stores have already started packing or dispatching your items.',
      );
    }

    const now = new Date();

    // Atomic transaction: cancel order + cancel suborders + release stock
    await this.prisma.$transaction(
      async (tx) => {
        // 1. Update Parent Order
        await tx.order.update({
          where: { id: order.id },
          data: { status: ParentOrderStatus.CANCELLED },
        });

        // 2. Update Suborders
        await tx.subOrder.updateMany({
          where: { parentOrderId: order.id, status: { not: SubOrderStatus.CANCELLED } },
          data: {
            status: SubOrderStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: `Customer requested: ${dto.reason}`,
          },
        });

        // 3. Release All Active Inventory Reservations for this order
        const reservations = await tx.inventoryReservation.findMany({
          where: { orderId: order.id, status: ReservationStatus.ACTIVE },
          include: { inventoryItem: true },
        });

        for (const res of reservations) {
          // Decrement reservedQuantity
          await tx.inventoryItem.update({
            where: { id: res.inventoryItemId },
            data: {
              reservedQuantity: { decrement: res.quantity },
            },
          });

          // Mark reservation released
          await tx.inventoryReservation.update({
            where: { id: res.id },
            data: { status: ReservationStatus.RELEASED },
          });

          // Log stock movement
          await tx.stockMovement.create({
            data: {
              inventoryItemId: res.inventoryItemId,
              type: StockMovementType.RETURN_RESTOCK,
              quantityChange: 0,
              quantityBefore: res.inventoryItem.quantityOnHand,
              quantityAfter: res.inventoryItem.quantityOnHand,
              referenceType: 'ORDER_CANCELLATION',
              referenceId: order.id,
              notes: `Reservation released on order cancellation: ${dto.reason}`,
              createdById: userId,
            },
          });
        }
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // Audit log
    await this.auditLogsService.log({
      userId,
      action: 'ORDER_CANCELLED_BY_CUSTOMER',
      entityName: 'Order',
      entityId: order.id,
      oldValues: { status: order.status },
      newValues: { status: ParentOrderStatus.CANCELLED, reason: dto.reason },
    });

    return { message: 'Order has been cancelled successfully.', orderId: order.id };
  }

  /**
   * Returns order tracking milestones and individual suborder fulfillment states.
   */
  async getCustomerOrderTracking(userId: string, orderId: string) {
    const order = await this.findCustomerOrderById(userId, orderId);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      createdAt: order.createdAt,
      subOrders: order.subOrders.map((sub) => ({
        subOrderId: sub.id,
        subOrderNumber: sub.subOrderNumber,
        storeName: sub.store?.name,
        status: sub.status,
        confirmedAt: sub.confirmedAt,
        packedAt: sub.packedAt,
        shippedAt: sub.shippedAt,
        deliveredAt: sub.deliveredAt,
        cancelledAt: sub.cancelledAt,
        cancelReason: sub.cancelReason,
      })),
    };
  }

  // =========================================================================
  // SELLER SUBORDER OPERATIONS
  // =========================================================================

  /**
   * Helper to resolve seller profile and verify ownership.
   */
  private async getSellerProfile(userId: string) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: { stores: true },
    });
    if (!seller) {
      throw new ForbiddenException('Access denied. You do not have an active seller profile.');
    }
    return seller;
  }

  /**
   * Lists suborders for the authenticated seller's stores.
   */
  async findSellerSuborders(userId: string, query: QueryOrdersDto) {
    const seller = await this.getSellerProfile(userId);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { sellerId: seller.id };
    if (query.status && Object.values(SubOrderStatus).includes(query.status as any)) {
      where.status = query.status as SubOrderStatus;
    }
    if (query.search) {
      where.subOrderNumber = { contains: query.search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      this.prisma.subOrder.count({ where }),
      this.prisma.subOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          store: { select: { id: true, name: true, slug: true } },
          items: true,
          parentOrder: {
            select: {
              id: true,
              orderNumber: true,
              currency: true,
              status: true,
              shippingAddressSnapshot: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single suborder details with seller multi-tenant isolation.
   */
  async findSellerSuborderById(userId: string, subOrderId: string) {
    const seller = await this.getSellerProfile(userId);

    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: {
        store: { select: { id: true, name: true, slug: true, address: true, city: true } },
        items: true,
        parentOrder: {
          select: {
            id: true,
            orderNumber: true,
            currency: true,
            status: true,
            shippingAddressSnapshot: true,
          },
        },
      },
    });

    if (!subOrder) {
      throw new NotFoundException(`Suborder with ID "${subOrderId}" not found.`);
    }

    if (subOrder.sellerId !== seller.id) {
      throw new ForbiddenException('Access denied. You can only access suborders for your own store.');
    }

    return subOrder;
  }

  /**
   * Seller updates suborder status according to strict transition rules.
   */
  async updateSellerSuborderStatus(
    userId: string,
    subOrderId: string,
    dto: UpdateSubOrderStatusDto,
  ) {
    const seller = await this.getSellerProfile(userId);
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
    });

    if (!subOrder) {
      throw new NotFoundException(`Suborder with ID "${subOrderId}" not found.`);
    }

    if (subOrder.sellerId !== seller.id) {
      throw new ForbiddenException('Access denied. You can only update suborders belonging to your store.');
    }

    // Permitted seller transitions:
    // PENDING_ACCEPTANCE -> CONFIRMED
    // CONFIRMED -> PROCESSING_PACKING
    // PROCESSING_PACKING -> READY_FOR_PICKUP
    const validTransitions: Record<SubOrderStatus, SubOrderStatus[]> = {
      [SubOrderStatus.PENDING_ACCEPTANCE]: [SubOrderStatus.CONFIRMED, SubOrderStatus.CANCELLED],
      [SubOrderStatus.CONFIRMED]: [SubOrderStatus.PROCESSING_PACKING, SubOrderStatus.CANCELLED],
      [SubOrderStatus.PROCESSING_PACKING]: [SubOrderStatus.READY_FOR_PICKUP],
      [SubOrderStatus.READY_FOR_PICKUP]: [], // Phase 08 Rider handles pickup
      [SubOrderStatus.ASSIGNED_FOR_DELIVERY]: [],
      [SubOrderStatus.OUT_FOR_DELIVERY]: [],
      [SubOrderStatus.DELIVERED]: [],
      [SubOrderStatus.CANCELLED]: [],
      [SubOrderStatus.REFUNDED]: [],
      [SubOrderStatus.DISPUTED]: [],
    };

    const allowed = validTransitions[subOrder.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition. Cannot change suborder from "${subOrder.status}" to "${dto.status}". Permitted next states: [${allowed.join(', ')}].`,
      );
    }

    const now = new Date();
    const updateData: any = {
      status: dto.status,
      sellerNotes: dto.sellerNotes ?? subOrder.sellerNotes,
    };

    if (dto.status === SubOrderStatus.CONFIRMED) updateData.confirmedAt = now;
    if (dto.status === SubOrderStatus.PROCESSING_PACKING) updateData.packedAt = now;
    if (dto.status === SubOrderStatus.READY_FOR_PICKUP) updateData.shippedAt = now;

    const updated = await this.prisma.subOrder.update({
      where: { id: subOrderId },
      data: updateData,
    });

    // Reconcile parent order status
    await this.reconcileParentOrderStatus(subOrder.parentOrderId);

    // Audit log
    await this.auditLogsService.log({
      userId,
      action: 'SELLER_SUBORDER_STATUS_UPDATED',
      entityName: 'SubOrder',
      entityId: subOrderId,
      oldValues: { status: subOrder.status },
      newValues: { status: dto.status, sellerNotes: dto.sellerNotes },
    });

    return updated;
  }

  /**
   * Seller rejects / cancels eligible suborder and releases associated inventory.
   */
  async rejectSellerSuborder(userId: string, subOrderId: string, dto: CancelOrderDto) {
    const seller = await this.getSellerProfile(userId);
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
    });

    if (!subOrder) {
      throw new NotFoundException(`Suborder with ID "${subOrderId}" not found.`);
    }

    if (subOrder.sellerId !== seller.id) {
      throw new ForbiddenException('Access denied. You can only reject suborders for your own store.');
    }

    // Only allow rejection from PENDING_ACCEPTANCE or CONFIRMED
    if (
      subOrder.status !== SubOrderStatus.PENDING_ACCEPTANCE &&
      subOrder.status !== SubOrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Cannot reject suborder in "${subOrder.status}" status. Only pending or confirmed suborders can be rejected.`,
      );
    }

    const now = new Date();

    // Atomic transaction: cancel suborder + release suborder reservations
    await this.prisma.$transaction(
      async (tx) => {
        // 1. Mark SubOrder cancelled
        await tx.subOrder.update({
          where: { id: subOrderId },
          data: {
            status: SubOrderStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: `Seller rejected: ${dto.reason}`,
          },
        });

        // 2. Release active inventory reservations for this specific suborder
        const reservations = await tx.inventoryReservation.findMany({
          where: { subOrderId, status: ReservationStatus.ACTIVE },
          include: { inventoryItem: true },
        });

        for (const res of reservations) {
          await tx.inventoryItem.update({
            where: { id: res.inventoryItemId },
            data: {
              reservedQuantity: { decrement: res.quantity },
            },
          });

          await tx.inventoryReservation.update({
            where: { id: res.id },
            data: { status: ReservationStatus.RELEASED },
          });

          await tx.stockMovement.create({
            data: {
              inventoryItemId: res.inventoryItemId,
              type: StockMovementType.RETURN_RESTOCK,
              quantityChange: 0,
              quantityBefore: res.inventoryItem.quantityOnHand,
              quantityAfter: res.inventoryItem.quantityOnHand,
              referenceType: 'SUBORDER_REJECTION',
              referenceId: subOrderId,
              notes: `Stock reservation released on seller rejection: ${dto.reason}`,
              createdById: userId,
            },
          });
        }
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // Reconcile parent order
    await this.reconcileParentOrderStatus(subOrder.parentOrderId);

    // Audit log
    await this.auditLogsService.log({
      userId,
      action: 'SELLER_SUBORDER_REJECTED',
      entityName: 'SubOrder',
      entityId: subOrderId,
      oldValues: { status: subOrder.status },
      newValues: { status: SubOrderStatus.CANCELLED, reason: dto.reason },
    });

    return { message: 'Suborder rejected successfully.', subOrderId };
  }

  // =========================================================================
  // ADMIN ORDER OPERATIONS
  // =========================================================================

  /**
   * Platform-wide parent orders listing for administrators.
   */
  async adminFindAllOrders(query: QueryOrdersDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && Object.values(ParentOrderStatus).includes(query.status as any)) {
      where.status = query.status as ParentOrderStatus;
    }
    if (query.search) {
      where.orderNumber = { contains: query.search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          subOrders: {
            include: {
              store: { select: { id: true, name: true, slug: true } },
              _count: { select: { items: true } },
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Administrator retrieves full parent order details.
   */
  async adminFindOrderById(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      include: {
        customer: true,
        subOrders: {
          include: {
            store: true,
            seller: true,
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

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found.`);
    }

    return order;
  }

  /**
   * Administrator modifies parent order status with audit logging.
   */
  async adminUpdateOrderStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order with ID "${orderId}" not found.`);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: dto.status },
    });

    await this.auditLogsService.log({
      userId: adminId,
      action: 'ADMIN_ORDER_STATUS_UPDATED',
      entityName: 'Order',
      entityId: orderId,
      oldValues: { status: order.status },
      newValues: { status: dto.status, reason: dto.reason },
    });

    return updated;
  }

  /**
   * Administrator cancels an entire order and releases all remaining stock reservations.
   */
  async adminCancelOrder(adminId: string, orderId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { subOrders: true },
    });
    if (!order) throw new NotFoundException(`Order with ID "${orderId}" not found.`);

    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Mark Parent Order Cancelled
        await tx.order.update({
          where: { id: orderId },
          data: { status: ParentOrderStatus.CANCELLED },
        });

        // 2. Mark All Suborders Cancelled
        await tx.subOrder.updateMany({
          where: { parentOrderId: orderId, status: { not: SubOrderStatus.CANCELLED } },
          data: {
            status: SubOrderStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: `Admin cancellation: ${dto.reason}`,
          },
        });

        // 3. Release All Active Reservations
        const reservations = await tx.inventoryReservation.findMany({
          where: { orderId, status: ReservationStatus.ACTIVE },
          include: { inventoryItem: true },
        });

        for (const res of reservations) {
          await tx.inventoryItem.update({
            where: { id: res.inventoryItemId },
            data: {
              reservedQuantity: { decrement: res.quantity },
            },
          });

          await tx.inventoryReservation.update({
            where: { id: res.id },
            data: { status: ReservationStatus.RELEASED },
          });

          await tx.stockMovement.create({
            data: {
              inventoryItemId: res.inventoryItemId,
              type: StockMovementType.RETURN_RESTOCK,
              quantityChange: 0,
              quantityBefore: res.inventoryItem.quantityOnHand,
              quantityAfter: res.inventoryItem.quantityOnHand,
              referenceType: 'ADMIN_ORDER_CANCELLATION',
              referenceId: orderId,
              notes: `Admin cancelled order: ${dto.reason}`,
              createdById: adminId,
            },
          });
        }
      },
      { timeout: 30000, maxWait: 10000 },
    );

    await this.auditLogsService.log({
      userId: adminId,
      action: 'ADMIN_ORDER_CANCELLED',
      entityName: 'Order',
      entityId: orderId,
      oldValues: { status: order.status },
      newValues: { status: ParentOrderStatus.CANCELLED, reason: dto.reason },
    });

    return { message: 'Order and associated suborders cancelled by admin.', orderId };
  }

  // =========================================================================
  // INTERNAL LIFECYCLE RECONCILIATION HELPER
  // =========================================================================

  /**
   * Automatically reconciles Parent Order status based on the collective states of its Suborders.
   */
  private async reconcileParentOrderStatus(parentOrderId: string) {
    const parent = await this.prisma.order.findUnique({
      where: { id: parentOrderId },
      include: { subOrders: true },
    });

    if (!parent || parent.status === ParentOrderStatus.CANCELLED) return;

    const subStatuses = parent.subOrders.map((s) => s.status);
    const allCancelled = subStatuses.every((s) => s === SubOrderStatus.CANCELLED);
    const allDelivered = subStatuses.every((s) => s === SubOrderStatus.DELIVERED);
    const anyDelivered = subStatuses.some((s) => s === SubOrderStatus.DELIVERED);
    const anyProcessing = subStatuses.some(
      (s) =>
        s === SubOrderStatus.PROCESSING_PACKING ||
        s === SubOrderStatus.READY_FOR_PICKUP ||
        s === SubOrderStatus.OUT_FOR_DELIVERY,
    );

    let targetStatus: ParentOrderStatus = parent.status;

    if (allCancelled) {
      targetStatus = ParentOrderStatus.CANCELLED;
    } else if (allDelivered) {
      targetStatus = ParentOrderStatus.FULFILLED;
    } else if (anyDelivered || anyProcessing) {
      targetStatus = ParentOrderStatus.PARTIALLY_FULFILLED;
    }

    if (targetStatus !== parent.status) {
      await this.prisma.order.update({
        where: { id: parentOrderId },
        data: { status: targetStatus },
      });
    }
  }
}
