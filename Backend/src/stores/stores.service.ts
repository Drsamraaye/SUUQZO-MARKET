import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateStoreDto } from './dto/create-store.dto.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { AdminReviewStoreDto } from './dto/admin-review-store.dto.js';
import { ListStoresDto } from './dto/list-stores.dto.js';
import { SellerVerificationStatus, StoreStatus, UserRole } from '@prisma/client';
import crypto from 'node:crypto';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper to slugify a store name.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Creates a new store for a verified seller.
   */
  async createStore(userId: string, dto: CreateStoreDto) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (!seller) {
      throw new ForbiddenException(
        'You must complete seller onboarding before creating a store.',
      );
    }

    if (seller.verificationStatus !== SellerVerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        `Seller verification is required to create a store. Current status: ${seller.verificationStatus}.`,
      );
    }

    // Determine slug
    let baseSlug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    if (!baseSlug) {
      baseSlug = `store-${crypto.randomBytes(4).toString('hex')}`;
    }

    let slug = baseSlug;
    const existingSlug = await this.prisma.store.findUnique({ where: { slug } });
    if (existingSlug) {
      if (dto.slug) {
        throw new ConflictException(`Store slug "${dto.slug}" is already in use.`);
      }
      // If auto-generated, append short unique suffix
      slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    const store = await this.prisma.store.create({
      data: {
        sellerId: seller.id,
        name: dto.name,
        slug,
        description: dto.description,
        logoUrl: dto.logoUrl,
        bannerUrl: dto.bannerUrl,
        city: dto.city,
        district: dto.district,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone,
        email: dto.email,
        openingHours: dto.openingHours ?? undefined,
        status: StoreStatus.ACTIVE,
      },
    });

    await this.auditLogsService.log({
      userId,
      action: 'STORE_CREATED',
      entityName: 'Store',
      entityId: store.id,
      newValues: {
        name: store.name,
        slug: store.slug,
        sellerId: seller.id,
      },
    });

    await this.notificationsService.send({
      userId,
      title: 'Store Created Successfully',
      body: `Your store "${store.name}" is now active and ready for products!`,
      data: { storeId: store.id, slug: store.slug },
    });

    return store;
  }

  /**
   * Updates store profile with strict multi-tenant ownership isolation.
   */
  async updateStore(
    storeId: string,
    actorId: string,
    actorRole: string,
    dto: UpdateStoreDto,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { seller: true },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID "${storeId}" not found.`);
    }

    const isOwner = store.seller.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN || actorRole === UserRole.SUPER_ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Access denied. You do not own this store.');
    }

    // Protection: If store is SUSPENDED, sellers cannot self-reinstate
    if (
      store.status === StoreStatus.SUSPENDED &&
      dto.status &&
      dto.status !== StoreStatus.SUSPENDED &&
      !isAdmin
    ) {
      throw new ForbiddenException(
        'A suspended store can only be reinstated by a platform administrator.',
      );
    }

    // Check slug uniqueness if changed
    if (dto.slug && dto.slug !== store.slug) {
      const formattedSlug = this.slugify(dto.slug);
      const existing = await this.prisma.store.findUnique({ where: { slug: formattedSlug } });
      if (existing && existing.id !== storeId) {
        throw new ConflictException(`Store slug "${dto.slug}" is already taken.`);
      }
      dto.slug = formattedSlug;
    }

    const oldValues = {
      name: store.name,
      slug: store.slug,
      status: store.status,
      city: store.city,
      address: store.address,
    };

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.district !== undefined ? { district: dto.district } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.openingHours !== undefined ? { openingHours: dto.openingHours } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'STORE_UPDATED',
      entityName: 'Store',
      entityId: storeId,
      oldValues,
      newValues: dto,
    });

    return updated;
  }

  /**
   * Public store retrieval by unique slug.
   */
  async getBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            rating: true,
            reviewsCount: true,
          },
        },
      },
    });

    if (!store) {
      throw new NotFoundException(`Store with slug "${slug}" not found.`);
    }

    return store;
  }

  /**
   * Retrieves a single store by ID.
   */
  async getById(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        seller: {
          select: {
            id: true,
            businessName: true,
            verificationStatus: true,
            rating: true,
            reviewsCount: true,
          },
        },
      },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID "${storeId}" not found.`);
    }

    return store;
  }

  /**
   * Retrieves all stores owned by the current seller.
   */
  async listMyStores(userId: string) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (!seller) {
      return [];
    }

    return this.prisma.store.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Paginated store listing with optional public / active filtering.
   */
  async listStores(dto: ListStoresDto, isPublic = true) {
    const page = Math.max(1, dto.page || 1);
    const limit = Math.min(100, Math.max(1, dto.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (isPublic) {
      where.status = StoreStatus.ACTIVE;
    } else if (dto.status) {
      where.status = dto.status;
    }

    if (dto.city) {
      where.city = { contains: dto.city, mode: 'insensitive' };
    }

    if (dto.isFeatured !== undefined) {
      where.isFeatured = dto.isFeatured;
    }

    if (dto.search && dto.search.trim()) {
      const q = dto.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        include: {
          seller: {
            select: {
              id: true,
              businessName: true,
              rating: true,
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
   * Administrative store review, status control, and featuring.
   */
  async adminReviewStore(
    storeId: string,
    adminId: string,
    dto: AdminReviewStoreDto,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { seller: true },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID "${storeId}" not found.`);
    }

    const oldValues = {
      status: store.status,
      isFeatured: store.isFeatured,
    };

    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        status: dto.status,
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      },
    });

    await this.auditLogsService.log({
      userId: adminId,
      action: `STORE_STATUS_${dto.status}`,
      entityName: 'Store',
      entityId: storeId,
      oldValues,
      newValues: dto,
    });

    await this.notificationsService.send({
      userId: store.seller.userId,
      title: `Store Status Updated: ${dto.status}`,
      body: `Your store "${store.name}" status has been set to ${dto.status}. ${dto.reason ? `Reason: ${dto.reason}` : ''}`,
      data: { storeId, status: dto.status, reason: dto.reason },
    });

    return updated;
  }
}
