import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import crypto from 'node:crypto';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async create(dto: CreateBrandDto) {
    let slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
    if (!slug) slug = `brand-${crypto.randomBytes(4).toString('hex')}`;

    const existing = await this.prisma.brand.findUnique({ where: { slug } });
    if (existing) {
      if (dto.slug) throw new ConflictException(`Brand slug "${dto.slug}" is already in use.`);
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    return this.prisma.brand.create({
      data: {
        name: dto.name,
        slug,
        logoUrl: dto.logoUrl,
      },
    });
  }

  async findAll() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async findById(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException(`Brand with ID "${id}" not found.`);
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto) {
    const existing = await this.prisma.brand.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Brand with ID "${id}" not found.`);

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      const formatted = this.slugify(dto.slug);
      const conflict = await this.prisma.brand.findUnique({ where: { slug: formatted } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Brand slug "${dto.slug}" is already in use.`);
      }
      slug = formatted;
    }

    return this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        slug,
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      },
    });
  }
}
