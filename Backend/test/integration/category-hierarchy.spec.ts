import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { CategoriesModule } from '../../src/categories/categories.module.js';
import { CategoriesService } from '../../src/categories/categories.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('Phase 05: Category Hierarchy & Lifecycle Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let categoriesService: CategoriesService;

  const testSuffix = Date.now().toString().slice(-6);
  let rootCatId: string;
  let subCatId: string;
  let childCatId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, CategoriesModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    categoriesService = moduleRef.get<CategoriesService>(CategoriesService);
    await moduleRef.init();
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const catIds = [childCatId, subCatId, rootCatId].filter(Boolean);
      if (catIds.length > 0) {
        await prisma.category.deleteMany({ where: { id: { in: catIds } } });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  describe('1. Category Creation & Hierarchy', () => {
    it('should create a root category at level 1', async () => {
      const root = await categoriesService.create({
        name: `Electronics ${testSuffix}`,
        slug: `electronics-${testSuffix}`,
        description: 'Root Electronics Category',
      });

      expect(root).toBeDefined();
      expect(root.level).toBe(1);
      expect(root.parentId).toBeNull();
      rootCatId = root.id;
    });

    it('should create a sub-category at level 2 linked to root', async () => {
      const sub = await categoriesService.create({
        name: `Phones & Tablets ${testSuffix}`,
        slug: `phones-tablets-${testSuffix}`,
        parentId: rootCatId,
      });

      expect(sub).toBeDefined();
      expect(sub.level).toBe(2);
      expect(sub.parentId).toBe(rootCatId);
      subCatId = sub.id;
    });

    it('should create a child sub-category at level 3', async () => {
      const child = await categoriesService.create({
        name: `Smartphones ${testSuffix}`,
        slug: `smartphones-${testSuffix}`,
        parentId: subCatId,
      });

      expect(child).toBeDefined();
      expect(child.level).toBe(3);
      expect(child.parentId).toBe(subCatId);
      childCatId = child.id;
    });

    it('should reject duplicate category slug with ConflictException', async () => {
      await expect(
        categoriesService.create({
          name: 'Duplicate Category',
          slug: `electronics-${testSuffix}`,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('2. Circular Parent-Child Prevention', () => {
    it('should prevent category from setting itself as parent', async () => {
      await expect(
        categoriesService.update(rootCatId, {
          parentId: rootCatId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent setting descendant as parent (cycle detection)', async () => {
      // Trying to set rootCat parent to childCat (which is a descendant of rootCat)
      await expect(
        categoriesService.update(rootCatId, {
          parentId: childCatId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Category Query & Hierarchy Tree', () => {
    it('should retrieve category by slug with children', async () => {
      const found = await categoriesService.findBySlug(`electronics-${testSuffix}`);
      expect(found).toBeDefined();
      expect(found.children.length).toBeGreaterThanOrEqual(1);
      expect(found.children[0].id).toBe(subCatId);
    });

    it('should return nested tree structure when tree=true', async () => {
      const tree: any = await categoriesService.findAll({ tree: true }, false);
      expect(Array.isArray(tree)).toBe(true);
      const rootInTree = tree.find((c: any) => c.id === rootCatId);
      expect(rootInTree).toBeDefined();
      expect(rootInTree?.children.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Referential Integrity on Deletion', () => {
    it('should prevent deleting category that has sub-categories', async () => {
      await expect(categoriesService.delete(rootCatId)).rejects.toThrow(BadRequestException);
    });

    it('should allow deleting leaf category without products or children', async () => {
      const leaf = await categoriesService.create({
        name: `Temporary Leaf ${testSuffix}`,
        parentId: subCatId,
      });

      const deleted = await categoriesService.delete(leaf.id);
      expect(deleted.deleted).toBe(true);

      await expect(categoriesService.findById(leaf.id)).rejects.toThrow(NotFoundException);
    });
  });
});
