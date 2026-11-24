import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { ListCategoriesDto } from './dto/list-categories.dto.js';
import crypto from 'node:crypto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Validates that targetParentId is not categoryId itself and is not a descendant of categoryId.
   */
  private async assertNoCycle(categoryId: string, targetParentId: string): Promise<void> {
    if (categoryId === targetParentId) {
      throw new BadRequestException('A category cannot be its own parent.');
    }

    let currentParentId: string | null = targetParentId;
    const visited = new Set<string>();

    while (currentParentId) {
      if (currentParentId === categoryId) {
        throw new BadRequestException(
          'Circular hierarchy detected. A category cannot have one of its descendants as its parent.',
        );
      }
      if (visited.has(currentParentId)) {
        break;
      }
      visited.add(currentParentId);

      const parentCategory: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });

      currentParentId = parentCategory?.parentId || null;
    }
  }

  /**
   * Creates a new category (Admin only).
   */
  async create(dto: CreateCategoryDto, adminId?: string) {
    let slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    if (!slug) {
      slug = `cat-${crypto.randomBytes(4).toString('hex')}`;
    }

    const existingSlug = await this.prisma.category.findUnique({ where: { slug } });
    if (existingSlug) {
      if (dto.slug) {
        throw new ConflictException(`Category slug "${dto.slug}" is already in use.`);
      }
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    let level = 1;
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) {
        throw new NotFoundException(`Parent category with ID "${dto.parentId}" not found.`);
      }
      level = parent.level + 1;
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        parentId: dto.parentId || null,
        iconUrl: dto.iconUrl,
        bannerUrl: dto.bannerUrl,
        level,
        displayOrder: dto.displayOrder ?? 0,
        commissionRateOverride: dto.commissionRateOverride ?? undefined,
        isActive: dto.isActive ?? true,
      },
      include: { parent: true },
    });

    if (adminId) {
      await this.auditLogsService.log({
        userId: adminId,
        action: 'CATEGORY_CREATED',
        entityName: 'Category',
        entityId: category.id,
        newValues: { name: category.name, slug: category.slug, parentId: category.parentId },
      });
    }

    return category;
  }

  /**
   * Updates an existing category (Admin only).
   */
  async update(id: string, dto: UpdateCategoryDto, adminId?: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Category with ID "${id}" not found.`);
    }

    let newLevel = existing.level;
    let newParentId = existing.parentId;

    if (dto.parentId !== undefined) {
      if (dto.parentId === null || dto.parentId === '') {
        newParentId = null;
        newLevel = 1;
      } else {
        await this.assertNoCycle(id, dto.parentId);
        const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
        if (!parent) {
          throw new NotFoundException(`Parent category with ID "${dto.parentId}" not found.`);
        }
        newParentId = dto.parentId;
        newLevel = parent.level + 1;
      }
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      const formatted = this.slugify(dto.slug);
      const conflict = await this.prisma.category.findUnique({ where: { slug: formatted } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Category slug "${dto.slug}" is already in use.`);
      }
      slug = formatted;
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        slug,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        parentId: newParentId,
        level: newLevel,
        ...(dto.iconUrl !== undefined ? { iconUrl: dto.iconUrl } : {}),
        ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.commissionRateOverride !== undefined
          ? { commissionRateOverride: dto.commissionRateOverride }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { parent: true, children: true },
    });

    if (adminId) {
      await this.auditLogsService.log({
        userId: adminId,
        action: 'CATEGORY_UPDATED',
        entityName: 'Category',
        entityId: id,
        oldValues: { name: existing.name, slug: existing.slug, parentId: existing.parentId },
        newValues: dto,
      });
    }

    return updated;
  }

  /**
   * Retrieves categories with optional search, parent filtering, and hierarchical tree structure.
   */
  async findAll(query: ListCategoriesDto, isPublic = true) {
    const where: any = {};

    if (isPublic) {
      where.isActive = true;
    } else if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.parentId !== undefined) {
      where.parentId = query.parentId === 'null' || query.parentId === '' ? null : query.parentId;
    }

    if (query.search && query.search.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    if (query.tree) {
      // Tree view: fetch root categories with nested active children
      const rootCategories = await this.prisma.category.findMany({
        where: { ...where, parentId: null },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: {
          children: {
            where: isPublic ? { isActive: true } : undefined,
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
            include: {
              children: {
                where: isPublic ? { isActive: true } : undefined,
                orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
              },
            },
          },
        },
      });
      return rootCategories;
    }

    return this.prisma.category.findMany({
      where,
      orderBy: [{ level: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  /**
   * Retrieves a single category by ID.
   */
  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          orderBy: { displayOrder: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found.`);
    }

    return category;
  }

  /**
   * Retrieves a single category by slug.
   */
  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found.`);
    }

    return category;
  }

  /**
   * Deletes a category. Enforces referential integrity (cannot delete if it has products or children).
   */
  async delete(id: string, adminId?: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, children: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${id}" not found.`);
    }

    if (category._count.products > 0) {
      throw new BadRequestException(
        `Cannot delete category "${category.name}" because it contains ${category._count.products} products. Deactivate it instead.`,
      );
    }

    if (category._count.children > 0) {
      throw new BadRequestException(
        `Cannot delete category "${category.name}" because it has ${category._count.children} child sub-categories. Reassign them first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });

    if (adminId) {
      await this.auditLogsService.log({
        userId: adminId,
        action: 'CATEGORY_DELETED',
        entityName: 'Category',
        entityId: id,
        oldValues: { name: category.name, slug: category.slug },
      });
    }

    return { deleted: true, id };
  }
}
