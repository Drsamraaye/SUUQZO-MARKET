import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SubmitSellerApplicationDto } from './dto/submit-seller-application.dto.js';
import { SubmitKycDocumentDto } from './dto/submit-kyc-document.dto.js';
import { ReviewSellerApplicationDto } from './dto/review-seller-application.dto.js';
import { ReviewKycDocumentDto } from './dto/review-kyc-document.dto.js';
import { ListApplicationsDto } from './dto/list-applications.dto.js';
import { SellerVerificationStatus, UserRole } from '@prisma/client';

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Submits or updates a seller onboarding application.
   */
  async submitApplication(userId: string, dto: SubmitSellerApplicationDto) {
    const existing = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (existing && existing.verificationStatus === SellerVerificationStatus.VERIFIED) {
      throw new BadRequestException('Your seller profile is already verified.');
    }

    const sellerProfile = await this.prisma.sellerProfile.upsert({
      where: { userId },
      update: {
        businessName: dto.businessName,
        legalName: dto.legalName,
        taxId: dto.taxId,
        businessRegistrationNo: dto.businessRegistrationNo,
        defaultPayoutMethod: dto.defaultPayoutMethod,
        payoutAccountIdentifier: dto.payoutAccountIdentifier,
        payoutAccountDetails: dto.payoutAccountDetails ?? undefined,
        verificationStatus: SellerVerificationStatus.PENDING_REVIEW,
      },
      create: {
        userId,
        businessName: dto.businessName,
        legalName: dto.legalName,
        taxId: dto.taxId,
        businessRegistrationNo: dto.businessRegistrationNo,
        defaultPayoutMethod: dto.defaultPayoutMethod,
        payoutAccountIdentifier: dto.payoutAccountIdentifier,
        payoutAccountDetails: dto.payoutAccountDetails ?? undefined,
        verificationStatus: SellerVerificationStatus.PENDING_REVIEW,
      },
    });

    await this.auditLogsService.log({
      userId,
      action: 'SELLER_APPLICATION_SUBMITTED',
      entityName: 'SellerProfile',
      entityId: sellerProfile.id,
      newValues: {
        businessName: dto.businessName,
        verificationStatus: SellerVerificationStatus.PENDING_REVIEW,
      },
    });

    await this.notificationsService.send({
      userId,
      title: 'Seller Application Received',
      body: 'Your seller onboarding application has been submitted and is currently under review.',
    });

    return sellerProfile;
  }

  /**
   * Uploads a KYC document for seller verification.
   */
  async uploadKycDocument(userId: string, dto: SubmitKycDocumentDto) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (!seller) {
      throw new BadRequestException(
        'Please submit a seller application before uploading KYC documents.',
      );
    }

    const document = await this.prisma.sellerKycDocument.create({
      data: {
        sellerId: seller.id,
        documentType: dto.documentType,
        documentUrl: dto.documentUrl,
        status: 'PENDING',
      },
    });

    await this.auditLogsService.log({
      userId,
      action: 'SELLER_KYC_DOCUMENT_UPLOADED',
      entityName: 'SellerKycDocument',
      entityId: document.id,
      newValues: {
        documentType: dto.documentType,
        status: 'PENDING',
      },
    });

    return document;
  }

  /**
   * Retrieves current authenticated user's seller profile, KYC documents, and stores.
   */
  async getMyApplication(userId: string) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        kycDocuments: true,
        stores: true,
      },
    });

    if (!seller) {
      throw new NotFoundException('No seller application found for this account.');
    }

    return seller;
  }

  /**
   * Paginated listing of seller onboarding applications for admin review.
   */
  async listApplications(dto: ListApplicationsDto) {
    const page = Math.max(1, dto.page || 1);
    const limit = Math.min(100, Math.max(1, dto.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.status) {
      where.verificationStatus = dto.status;
    }

    if (dto.search && dto.search.trim()) {
      const q = dto.search.trim();
      where.OR = [
        { businessName: { contains: q, mode: 'insensitive' } },
        { legalName: { contains: q, mode: 'insensitive' } },
        { taxId: { contains: q, mode: 'insensitive' } },
        { businessRegistrationNo: { contains: q, mode: 'insensitive' } },
        { user: { phone: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.sellerProfile.count({ where }),
      this.prisma.sellerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              status: true,
            },
          },
          kycDocuments: true,
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
   * Retrieves a single seller application with full details.
   */
  async getApplicationById(sellerId: string) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            assignedRoles: true,
            status: true,
          },
        },
        kycDocuments: true,
        stores: true,
      },
    });

    if (!seller) {
      throw new NotFoundException(`Seller application with ID "${sellerId}" not found.`);
    }

    return seller;
  }

  /**
   * Admin reviews seller application (APPROVE, REJECT, SUSPEND).
   * Strict security checks:
   * 1. Self-approval prevention: Admins cannot approve their own seller applications.
   * 2. Transactional role elevation: Upon approval, the SELLER role is atomically added.
   * 3. Comprehensive audit logging and event dispatch.
   */
  async reviewApplication(
    sellerId: string,
    adminId: string,
    dto: ReviewSellerApplicationDto,
  ) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerId },
      include: { user: true },
    });

    if (!seller) {
      throw new NotFoundException(`Seller application with ID "${sellerId}" not found.`);
    }

    // Strict self-approval prevention
    if (seller.userId === adminId) {
      throw new ForbiddenException(
        'Administrators cannot review or approve their own seller applications.',
      );
    }

    let targetStatus: SellerVerificationStatus;
    if (dto.decision === 'APPROVE') {
      targetStatus = SellerVerificationStatus.VERIFIED;
    } else if (dto.decision === 'REJECT') {
      targetStatus = SellerVerificationStatus.REJECTED;
    } else {
      targetStatus = SellerVerificationStatus.SUSPENDED;
    }

    const oldStatus = seller.verificationStatus;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update Seller Profile
      const updatedProfile = await tx.sellerProfile.update({
        where: { id: sellerId },
        data: {
          verificationStatus: targetStatus,
          ...(dto.commissionRate !== undefined ? { commissionRate: dto.commissionRate } : {}),
        },
      });

      // 2. Transactional role elevation on approval
      if (dto.decision === 'APPROVE') {
        const assignedRolesSet = new Set(seller.user.assignedRoles || []);
        assignedRolesSet.add(UserRole.SELLER);

        const newPrimaryRole =
          seller.user.role === UserRole.CUSTOMER
            ? UserRole.SELLER
            : seller.user.role;

        await tx.user.update({
          where: { id: seller.userId },
          data: {
            role: newPrimaryRole,
            assignedRoles: Array.from(assignedRolesSet),
          },
        });
      }

      return updatedProfile;
    }, { timeout: 30000, maxWait: 10000 });

    // 3. Create AuditLog
    await this.auditLogsService.log({
      userId: adminId,
      action: `SELLER_APPLICATION_${dto.decision}`,
      entityName: 'SellerProfile',
      entityId: sellerId,
      oldValues: { verificationStatus: oldStatus },
      newValues: {
        verificationStatus: targetStatus,
        reason: dto.reason,
        commissionRate: dto.commissionRate,
      },
    });

    // 4. Send notification
    const notificationTitle =
      dto.decision === 'APPROVE'
        ? 'Seller Application Approved!'
        : `Seller Application ${targetStatus}`;
    const notificationBody =
      dto.decision === 'APPROVE'
        ? 'Congratulations! Your seller application has been approved. You can now create your store.'
        : `Your seller application has been ${targetStatus.toLowerCase()}. ${dto.reason ? `Reason: ${dto.reason}` : ''}`;

    await this.notificationsService.send({
      userId: seller.userId,
      title: notificationTitle,
      body: notificationBody,
      data: { decision: dto.decision, status: targetStatus, reason: dto.reason },
    });

    return result;
  }

  /**
   * Admin reviews a specific KYC document.
   */
  async reviewKycDocument(
    documentId: string,
    adminId: string,
    dto: ReviewKycDocumentDto,
  ) {
    const document = await this.prisma.sellerKycDocument.findUnique({
      where: { id: documentId },
      include: { seller: true },
    });

    if (!document) {
      throw new NotFoundException(`KYC Document with ID "${documentId}" not found.`);
    }

    if (document.seller.userId === adminId) {
      throw new ForbiddenException(
        'Administrators cannot verify their own KYC documents.',
      );
    }

    const updated = await this.prisma.sellerKycDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        rejectionReason: dto.rejectionReason,
        verifiedAt: new Date(),
        verifiedByAdminId: adminId,
      },
    });

    await this.auditLogsService.log({
      userId: adminId,
      action: `SELLER_KYC_${dto.status}`,
      entityName: 'SellerKycDocument',
      entityId: documentId,
      oldValues: { status: document.status },
      newValues: { status: dto.status, rejectionReason: dto.rejectionReason },
    });

    await this.notificationsService.send({
      userId: document.seller.userId,
      title: `KYC Document ${dto.status}`,
      body: `Your document (${document.documentType}) has been ${dto.status.toLowerCase()}. ${dto.rejectionReason ? `Reason: ${dto.rejectionReason}` : ''}`,
    });

    return updated;
  }

  /**
   * Retrieves KYC documents for a seller with strict tenant isolation.
   */
  async getSellerDocuments(sellerId: string, actorId: string, actorRole: string) {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new NotFoundException(`Seller with ID "${sellerId}" not found.`);
    }

    const isOwner = seller.userId === actorId;
    const isAdmin = actorRole === UserRole.ADMIN || actorRole === UserRole.SUPER_ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Access denied. You cannot view KYC documents for this seller.');
    }

    return this.prisma.sellerKycDocument.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
