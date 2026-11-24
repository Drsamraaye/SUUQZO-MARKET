import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { QueryProductsDto } from './dto/query-products.dto.js';
import { ModerateProductDto } from './dto/moderate-product.dto.js';
import {
  ProductStatus,
  StockMovementType,
  StoreStatus,
  UserRole,
  Prisma,
} from '@prisma/client';
import crypto from 'node:crypto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private validatePrice(basePrice: number, compareAtPrice?: number | null): void {
    if (basePrice < 0) {
      throw new BadRequestException('Product price cannot be negative.');
    }
    if (compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice < basePrice) {
      throw new BadRequestException(
        'Compare-at price (original price) must be greater than or equal to regular price.',
      );
    }
  }

  /**
   * Creates a product with variants, initial inventory, and images.
   * Enforces verified store ownership.
   */
  async create(userId: string, userRole: string, dto: CreateProductDto) {
    // 1. Verify store and seller ownership
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

    if (store.status !== StoreStatus.ACTIVE) {
      throw new ForbiddenException(
        `Cannot create products in a store with status "${store.status}". Store must be ACTIVE.`,
      );
    }

    // 2. Validate category
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category || !category.isActive) {
      throw new BadRequestException('Category not found or is currently inactive.');
    }

    // 3. Validate brand if supplied
    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) {
        throw new BadRequestException(`Brand with ID "${dto.brandId}" not found.`);
      }
    }

    // 4. Validate base price
    this.validatePrice(dto.basePrice, dto.compareAtPrice);

    // 5. Generate and check slug unique per store
    let baseSlug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.title);
    if (!baseSlug) baseSlug = `prod-${crypto.randomBytes(4).toString('hex')}`;

    let slug = baseSlug;
    const existingSlug = await this.prisma.product.findUnique({
      where: { storeId_slug: { storeId: dto.storeId, slug } },
    });

    if (existingSlug) {
      if (dto.slug) {
        throw new ConflictException(
          `Product slug "${dto.slug}" already exists in this store. Please use a unique slug.`,
        );
      }
      slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    // 6. Transactional creation of Product + Variants + Inventory + Images
    const createdProduct = await this.prisma.$transaction(
      async (tx) => {
      const product = await tx.product.create({
        data: {
          storeId: dto.storeId,
          categoryId: dto.categoryId,
          brandId: dto.brandId || null,
          title: dto.title,
          slug,
          description: dto.description,
          status: ProductStatus.DRAFT,
          basePrice: new Prisma.Decimal(dto.basePrice),
          compareAtPrice: dto.compareAtPrice ? new Prisma.Decimal(dto.compareAtPrice) : null,
          currency: dto.currency || 'USD',
        },
      });

      // Prepare variants
      const variantsToCreate =
        dto.variants && dto.variants.length > 0
          ? dto.variants
          : [
              {
                title: 'Default',
                price: dto.basePrice,
                compareAtPrice: dto.compareAtPrice,
                sku: `${slug.toUpperCase()}-DEF-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
                attributes: {},
                initialStock: 0,
              },
            ];

      for (let i = 0; i < variantsToCreate.length; i++) {
        const v = variantsToCreate[i];
        this.validatePrice(v.price, v.compareAtPrice);

        const sku =
          v.sku?.trim() ||
          `${slug.toUpperCase()}-VAR-${i + 1}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

        // Check SKU uniqueness
        const skuConflict = await tx.productVariant.findUnique({ where: { sku } });
        if (skuConflict) {
          throw new ConflictException(`SKU "${sku}" is already in use by another product variant.`);
        }

        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            title: v.title,
            sku,
            barcode: v.barcode,
            price: new Prisma.Decimal(v.price),
            compareAtPrice: v.compareAtPrice ? new Prisma.Decimal(v.compareAtPrice) : null,
            attributes: v.attributes ?? {},
            weightKg: v.weightKg ? new Prisma.Decimal(v.weightKg) : null,
          },
        });

        // Initialize InventoryItem
        const initialStock = Math.max(0, v.initialStock || 0);
        const invItem = await tx.inventoryItem.create({
          data: {
            variantId: variant.id,
            storeId: dto.storeId,
            quantityOnHand: initialStock,
            reservedQuantity: 0,
            lowStockThreshold: 5,
          },
        });

        if (initialStock > 0) {
          await tx.stockMovement.create({
            data: {
              inventoryItemId: invItem.id,
              type: StockMovementType.INITIAL_STOCK,
              quantityChange: initialStock,
              quantityBefore: 0,
              quantityAfter: initialStock,
              referenceType: 'PRODUCT_CREATION',
              referenceId: product.id,
              notes: 'Initial inventory on product creation',
              createdById: userId,
            },
          });
        }
      }

      // Prepare images
      if (dto.images && dto.images.length > 0) {
        let hasPrimary = dto.images.some((img) => img.isPrimary);
        for (let i = 0; i < dto.images.length; i++) {
          const img = dto.images[i];
          const isPrimary = hasPrimary ? !!img.isPrimary : i === 0;

          await tx.productImage.create({
            data: {
              productId: product.id,
              url: img.url,
              altText: img.altText || product.title,
              sortOrder: img.sortOrder ?? i,
              isPrimary,
              variantId: img.variantId || null,
            },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          variants: { include: { inventoryItems: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          category: true,
          brand: true,
          store: { select: { id: true, name: true, slug: true } },
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    await this.auditLogsService.log({
      userId,
      action: 'PRODUCT_CREATED',
      entityName: 'Product',
      entityId: createdProduct!.id,
      newValues: { title: dto.title, storeId: dto.storeId, slug },
    });

    return createdProduct;
  }

  /**
   * Updates an existing product.
   * Enforces seller store ownership.
   */
  async update(productId: string, userId: string, userRole: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        store: { include: { seller: true } },
        variants: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found.`);
    }

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    if (!isAdmin && product.store.seller.userId !== userId) {
      throw new ForbiddenException('Access denied. You do not own this product.');
    }

    // Price validation
    if (dto.basePrice !== undefined) {
      this.validatePrice(
        dto.basePrice,
        dto.compareAtPrice !== undefined ? dto.compareAtPrice : Number(product.compareAtPrice),
      );
    }

    // Slug check if changed
    let slug = product.slug;
    if (dto.slug && dto.slug !== product.slug) {
      const formatted = this.slugify(dto.slug);
      const conflict = await this.prisma.product.findUnique({
        where: { storeId_slug: { storeId: product.storeId, slug: formatted } },
      });
      if (conflict && conflict.id !== productId) {
        throw new ConflictException(`Slug "${dto.slug}" already exists in this store.`);
      }
      slug = formatted;
    }

    // Category check
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat || !cat.isActive) {
        throw new BadRequestException('Selected category not found or inactive.');
      }
    }

    // Sellers cannot self-publish products
    if (dto.status && dto.status === ProductStatus.PUBLISHED && !isAdmin) {
      throw new ForbiddenException(
        'Sellers cannot directly publish products. Please submit for administrative review.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          ...(dto.brandId !== undefined ? { brandId: dto.brandId } : {}),
          ...(dto.title ? { title: dto.title } : {}),
          slug,
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.basePrice !== undefined ? { basePrice: new Prisma.Decimal(dto.basePrice) } : {}),
          ...(dto.compareAtPrice !== undefined
            ? {
                compareAtPrice:
                  dto.compareAtPrice === null ? null : new Prisma.Decimal(dto.compareAtPrice),
              }
            : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
          ...(dto.isFeatured !== undefined && isAdmin ? { isFeatured: dto.isFeatured } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      });

      // Images updates if provided
      if (dto.images) {
        await tx.productImage.deleteMany({ where: { productId } });
        let hasPrimary = dto.images.some((img) => img.isPrimary);
        for (let i = 0; i < dto.images.length; i++) {
          const img = dto.images[i];
          await tx.productImage.create({
            data: {
              productId,
              url: img.url,
              altText: img.altText || product.title,
              sortOrder: img.sortOrder ?? i,
              isPrimary: hasPrimary ? !!img.isPrimary : i === 0,
              variantId: img.variantId || null,
            },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: productId },
        include: {
          variants: { include: { inventoryItems: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          category: true,
          brand: true,
          store: { select: { id: true, name: true, slug: true } },
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    await this.auditLogsService.log({
      userId,
      action: 'PRODUCT_UPDATED',
      entityName: 'Product',
      entityId: productId,
      newValues: dto,
    });

    return updated;
  }

  /**
   * Seller submits product for platform moderation.
   */
  async submitForReview(productId: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        store: { include: { seller: true } },
        variants: true,
        images: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found.`);
    }

    if (product.store.seller.userId !== userId) {
      throw new ForbiddenException('Access denied. You do not own this product.');
    }

    if (product.variants.length === 0) {
      throw new BadRequestException('Product must have at least one variant before submitting for review.');
    }

    if (product.images.length === 0) {
      throw new BadRequestException('Product must have at least one image before submitting for review.');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.PENDING_REVIEW },
    });

    await this.auditLogsService.log({
      userId,
      action: 'PRODUCT_SUBMITTED_FOR_REVIEW',
      entityName: 'Product',
      entityId: productId,
    });

    return updated;
  }

  /**
   * Admin moderates product (APPROVE, REJECT, SUSPEND, REQUEST_CHANGES).
   * Strict self-approval prevention: Admins cannot approve products from their own stores.
   */
  async moderateProduct(productId: string, adminId: string, dto: ModerateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: { include: { seller: true } } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found.`);
    }

    // Strict self-approval prevention
    if (product.store.seller.userId === adminId) {
      throw new ForbiddenException(
        'Administrators cannot review or approve products belonging to their own store.',
      );
    }

    let targetStatus: ProductStatus;
    if (dto.action === 'APPROVE') {
      targetStatus = ProductStatus.PUBLISHED;
    } else if (dto.action === 'REJECT') {
      targetStatus = ProductStatus.REJECTED;
    } else if (dto.action === 'SUSPEND') {
      targetStatus = ProductStatus.ARCHIVED;
    } else {
      // REQUEST_CHANGES returns product to DRAFT
      targetStatus = ProductStatus.DRAFT;
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: targetStatus },
    });

    await this.auditLogsService.log({
      userId: adminId,
      action: `PRODUCT_MODERATED_${dto.action}`,
      entityName: 'Product',
      entityId: productId,
      oldValues: { status: product.status },
      newValues: { status: targetStatus, reason: dto.reason },
    });

    await this.notificationsService.send({
      userId: product.store.seller.userId,
      title: `Product Moderation: ${dto.action}`,
      body: `Your product "${product.title}" status is now ${targetStatus}. ${dto.reason ? `Feedback: ${dto.reason}` : ''}`,
      data: { productId, action: dto.action, status: targetStatus, reason: dto.reason },
    });

    return updated;
  }

  /**
   * Archives a product (soft delete).
   */
  async archive(productId: string, userId: string, userRole: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: { include: { seller: true } } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found.`);
    }

    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    if (!isAdmin && product.store.seller.userId !== userId) {
      throw new ForbiddenException('Access denied. You do not own this product.');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
    });

    await this.auditLogsService.log({
      userId,
      action: 'PRODUCT_ARCHIVED',
      entityName: 'Product',
      entityId: productId,
    });

    return updated;
  }

  /**
   * Retrieves single product by ID.
   */
  async findById(productId: string, isPublic = true) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        brand: true,
        store: { select: { id: true, name: true, slug: true, status: true, city: true } },
        variants: {
          include: {
            inventoryItems: {
              select: {
                id: true,
                quantityOnHand: true,
                reservedQuantity: true,
                lowStockThreshold: true,
              },
            },
          },
        },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found.`);
    }

    if (isPublic) {
      if (product.status !== ProductStatus.PUBLISHED || product.store.status !== StoreStatus.ACTIVE) {
        throw new NotFoundException(`Product with ID "${productId}" is not available.`);
      }
    }

    return product;
  }

  /**
   * Public product retrieval by storeSlug and productSlug.
   */
  async findBySlug(storeSlug: string, productSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        slug: productSlug,
        store: { slug: storeSlug, status: StoreStatus.ACTIVE },
        status: ProductStatus.PUBLISHED,
      },
      include: {
        category: true,
        brand: true,
        store: { select: { id: true, name: true, slug: true, city: true, rating: true } },
        variants: {
          include: {
            inventoryItems: {
              select: {
                id: true,
                quantityOnHand: true,
                reservedQuantity: true,
              },
            },
          },
        },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product "${productSlug}" not found in store "${storeSlug}".`);
    }

    return product;
  }

  /**
   * Comprehensive product search and filtering engine.
   */
  async queryProducts(dto: QueryProductsDto, isPublic = true) {
    const page = Math.max(1, dto.page || 1);
    const limit = Math.min(100, Math.max(1, dto.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (isPublic) {
      where.status = ProductStatus.PUBLISHED;
      where.store = { status: StoreStatus.ACTIVE };
    } else if (dto.status) {
      where.status = dto.status;
    }

    if (dto.categoryId) where.categoryId = dto.categoryId;
    if (dto.brandId) where.brandId = dto.brandId;
    if (dto.storeId) where.storeId = dto.storeId;
    if (dto.isFeatured !== undefined) where.isFeatured = dto.isFeatured;

    // Price range
    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      where.basePrice = {};
      if (dto.minPrice !== undefined) where.basePrice.gte = new Prisma.Decimal(dto.minPrice);
      if (dto.maxPrice !== undefined) where.basePrice.lte = new Prisma.Decimal(dto.maxPrice);
    }

    // In stock filter
    if (dto.inStock) {
      where.variants = {
        some: {
          inventoryItems: {
            some: {
              quantityOnHand: { gt: 0 },
            },
          },
        },
      };
    }

    // Search query
    if (dto.search && dto.search.trim()) {
      const q = dto.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { brand: { name: { contains: q, mode: 'insensitive' } } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // Sorting
    let orderBy: any = [{ createdAt: 'desc' }];
    if (dto.sortBy === 'price_asc') {
      orderBy = [{ basePrice: 'asc' }];
    } else if (dto.sortBy === 'price_desc') {
      orderBy = [{ basePrice: 'desc' }];
    } else if (dto.sortBy === 'rating') {
      orderBy = [{ rating: 'desc' }];
    } else if (dto.sortBy === 'popular') {
      orderBy = [{ viewCount: 'desc' }];
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          store: { select: { id: true, name: true, slug: true, city: true } },
          images: {
            where: { isPrimary: true },
            take: 1,
          },
          variants: {
            take: 1,
            select: { id: true, sku: true, price: true },
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
}
