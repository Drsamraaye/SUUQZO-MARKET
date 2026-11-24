import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

export interface CreateAuditLogParams {
  userId?: string | null;
  action: string;
  entityName: string;
  entityId: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit log entry for compliance, accountability, and traceability.
   */
  async log(params: CreateAuditLogParams) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          userId: params.userId ?? null,
          action: params.action,
          entityName: params.entityName,
          entityId: params.entityId,
          oldValues: params.oldValues ?? undefined,
          newValues: params.newValues ?? undefined,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (err: any) {
      // Audit log failures should be alerted but not necessarily break transaction unless required
      this.logger.error(`Failed to record audit log: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Retrieves audit history for a specific entity.
   */
  async findByEntity(entityName: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityName, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves audit logs for actions performed by or targeting a specific user.
   */
  async findByUser(userId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { userId },
          { entityName: 'User', entityId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Paginated listing of audit logs with optional filters.
   */
  async listLogs(params: {
    page?: number;
    limit?: number;
    action?: string;
    entityName?: string;
    userId?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.action) where.action = params.action;
    if (params.entityName) where.entityName = params.entityName;
    if (params.userId) where.userId = params.userId;

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
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
}
