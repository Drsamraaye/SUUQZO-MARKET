import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ListInventoryDto } from './dto/list-inventory.dto.js';
import { UserRole } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Adjusts stock quantity transactionally, recording immutable stock movement.
   * Prevents negative inventory.
   */
  async adjustStock(userId: string, userRole: string, dto: AdjustStockDto) {
    // 1. Verify store ownership
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { seller: true },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID "${dto.storeId}" not found.`);
    }

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    if (!isAdmin && store.seller.userId !== userId) {
      throw new ForbiddenException('Access denied. You do not own this store.');
    }

    // 2. Verify variant
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });

    if (!variant) {
      throw new NotFoundException(`Product variant with ID "${dto.variantId}" not found.`);
    }

    // 3. Perform atomic inventory adjustment inside transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Find or create InventoryItem
      let invItem = await tx.inventoryItem.findUnique({
        where: {
          variantId_storeId: {
            variantId: dto.variantId,
            storeId: dto.storeId,
          },
        },
      });

      if (!invItem) {
        invItem = await tx.inventoryItem.create({
          data: {
            variantId: dto.variantId,
            storeId: dto.storeId,
            quantityOnHand: 0,
            reservedQuantity: 0,
            lowStockThreshold: dto.lowStockThreshold ?? 5,
          },
        });
      }

      const quantityBefore = invItem.quantityOnHand;
      const quantityAfter = quantityBefore + dto.quantityChange;

      // Negative stock guard
      if (quantityAfter < 0) {
        throw new BadRequestException(
          `Insufficient stock. Current on-hand: ${quantityBefore}, attempted reduction: ${Math.abs(dto.quantityChange)}. Negative inventory is prohibited.`,
        );
      }

      // Update InventoryItem
      const updatedInvItem = await tx.inventoryItem.update({
        where: { id: invItem.id },
        data: {
          quantityOnHand: quantityAfter,
          ...(dto.lowStockThreshold !== undefined ? { lowStockThreshold: dto.lowStockThreshold } : {}),
        },
      });

      // Record StockMovement
      const movement = await tx.stockMovement.create({
        data: {
          inventoryItemId: invItem.id,
          type: dto.type,
          quantityChange: dto.quantityChange,
          quantityBefore,
          quantityAfter,
          notes: dto.notes,
          createdById: userId,
        },
      });

      return { inventoryItem: updatedInvItem, movement };
    }, { timeout: 30000, maxWait: 10000 });

    // 4. Record AuditLog
    await this.auditLogsService.log({
      userId,
      action: 'INVENTORY_STOCK_ADJUSTED',
      entityName: 'InventoryItem',
      entityId: result.inventoryItem.id,
      oldValues: { quantityOnHand: result.movement.quantityBefore },
      newValues: {
        quantityOnHand: result.movement.quantityAfter,
        change: dto.quantityChange,
        type: dto.type,
      },
    });

    // 5. Trigger low stock alert if threshold crossed
    if (result.inventoryItem.quantityOnHand <= result.inventoryItem.lowStockThreshold) {
      await this.notificationsService.send({
        userId: store.seller.userId,
        title: 'Low Stock Alert',
        body: `Low stock alert: Variant "${variant.title}" (SKU: ${variant.sku}) in store "${store.name}" has only ${result.inventoryItem.quantityOnHand} units remaining.`,
        data: {
          inventoryItemId: result.inventoryItem.id,
          variantId: variant.id,
          storeId: store.id,
          quantityOnHand: result.inventoryItem.quantityOnHand,
        },
      });
    }

    return result;
  }

  /**
   * Real-time stock availability check for variant in store.
   */
  async getAvailability(variantId: string, storeId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: {
        variantId_storeId: { variantId, storeId },
      },
      include: {
        variant: {
          select: { id: true, title: true, sku: true, price: true },
        },
      },
    });

    if (!item) {
      return {
        variantId,
        storeId,
        quantityOnHand: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        isInStock: false,
      };
    }

    const availableQuantity = Math.max(0, item.quantityOnHand - item.reservedQuantity);

    return {
      variantId,
      storeId,
      variantTitle: item.variant.title,
      sku: item.variant.sku,
      price: item.variant.price,
      quantityOnHand: item.quantityOnHand,
      reservedQuantity: item.reservedQuantity,
      availableQuantity,
      isInStock: availableQuantity > 0,
    };
  }

  /**
   * Paginated listing of store inventory.
   */
  async listInventory(userId: string, userRole: string, dto: ListInventoryDto) {
    const page = Math.max(1, dto.page || 1);
    const limit = Math.min(100, Math.max(1, dto.limit || 20));
    const skip = (page - 1) * limit;

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

    const where: any = {};

    if (!isAdmin) {
      // Scope strictly to caller's stores
      where.store = {
        seller: { userId },
      };
    }

    if (dto.storeId) {
      where.storeId = dto.storeId;
    }

    if (dto.search && dto.search.trim()) {
      const q = dto.search.trim();
      where.variant = {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { product: { title: { contains: q, mode: 'insensitive' } } },
        ],
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ quantityOnHand: 'asc' }],
        include: {
          store: { select: { id: true, name: true, slug: true } },
          variant: {
            include: {
              product: { select: { id: true, title: true, slug: true } },
            },
          },
        },
      }),
    ]);

    // If lowStockOnly requested, filter in-memory or where condition
    const filteredItems = dto.lowStockOnly
      ? items.filter((item) => item.quantityOnHand <= item.lowStockThreshold)
      : items;

    return {
      items: filteredItems,
      meta: {
        total: dto.lowStockOnly ? filteredItems.length : total,
        page,
        limit,
        totalPages: Math.ceil((dto.lowStockOnly ? filteredItems.length : total) / limit),
      },
    };
  }

  /**
   * Retrieves stock movements audit trail for an inventory item.
   */
  async getMovements(inventoryItemId: string, userId: string, userRole: string) {
    const invItem = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { store: { include: { seller: true } } },
    });

    if (!invItem) {
      throw new NotFoundException(`Inventory item with ID "${inventoryItemId}" not found.`);
    }

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    if (!isAdmin && invItem.store.seller.userId !== userId) {
      throw new ForbiddenException('Access denied. You do not own this store inventory.');
    }

    return this.prisma.stockMovement.findMany({
      where: { inventoryItemId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
