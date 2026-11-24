import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { SellersModule } from '../../src/sellers/sellers.module.js';
import { SellersService } from '../../src/sellers/sellers.service.js';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../../src/notifications/notifications.module.js';
import {
  UserRole,
  UserStatus,
  SellerVerificationStatus,
  PayoutMethodType,
} from '@prisma/client';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('Phase 04: Seller Onboarding & KYC Workflow Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sellersService: SellersService;

  const testSuffix = Date.now().toString().slice(-6);
  let adminUserId: string;
  let applicantUserId: string;
  let otherApplicantUserId: string;
  let sellerProfileId: string;
  let kycDocumentId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditLogsModule, NotificationsModule, SellersModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    sellersService = moduleRef.get<SellersService>(SellersService);
    await moduleRef.init();

    // 1. Admin user
    const admin = await prisma.user.create({
      data: {
        phone: `+25261800${testSuffix}`,
        email: `seller_admin_${testSuffix}@suuqzo.test`,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.ADMIN],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    adminUserId = admin.id;

    // 2. Applicant user
    const applicant = await prisma.user.create({
      data: {
        phone: `+25261801${testSuffix}`,
        email: `applicant_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    applicantUserId = applicant.id;

    // 3. Other applicant user
    const otherApplicant = await prisma.user.create({
      data: {
        phone: `+25261802${testSuffix}`,
        email: `other_applicant_${testSuffix}@suuqzo.test`,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        assignedRoles: [UserRole.CUSTOMER],
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
      },
    });
    otherApplicantUserId = otherApplicant.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const userIds = [adminUserId, applicantUserId, otherApplicantUserId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.sellerKycDocument.deleteMany({
          where: { seller: { userId: { in: userIds } } },
        });
        await prisma.sellerProfile.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.notification.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  }, 30000);

  describe('1. Seller Application Submission', () => {
    it('should submit a new seller application in PENDING_REVIEW state', async () => {
      const application = await sellersService.submitApplication(applicantUserId, {
        businessName: `Somali Spices & Coffee ${testSuffix}`,
        legalName: 'Somali Spices LLC',
        taxId: 'SO-TAX-98765',
        businessRegistrationNo: 'MOG-REG-4321',
        defaultPayoutMethod: PayoutMethodType.EVC_PLUS,
        payoutAccountIdentifier: '+252615551234',
      });

      expect(application).toBeDefined();
      expect(application.verificationStatus).toBe(SellerVerificationStatus.PENDING_REVIEW);
      expect(application.businessName).toBe(`Somali Spices & Coffee ${testSuffix}`);
      sellerProfileId = application.id;

      // Check notification sent
      const notification = await prisma.notification.findFirst({
        where: { userId: applicantUserId },
      });
      expect(notification).toBeDefined();
      expect(notification?.title).toContain('Application Received');
    });

    it('should retrieve my application details via getMyApplication', async () => {
      const myApp = await sellersService.getMyApplication(applicantUserId);
      expect(myApp.id).toBe(sellerProfileId);
      expect(myApp.verificationStatus).toBe(SellerVerificationStatus.PENDING_REVIEW);
    });
  });

  describe('2. KYC Document Upload', () => {
    it('should upload a KYC document linked to seller profile in PENDING status', async () => {
      const doc = await sellersService.uploadKycDocument(applicantUserId, {
        documentType: 'COMMERCIAL_LICENSE',
        documentUrl: 'https://storage.suuqzo.test/kyc/license-123.pdf',
      });

      expect(doc).toBeDefined();
      expect(doc.sellerId).toBe(sellerProfileId);
      expect(doc.status).toBe('PENDING');
      kycDocumentId = doc.id;
    });

    it('should reject KYC document upload if user has no seller application', async () => {
      await expect(
        sellersService.uploadKycDocument(otherApplicantUserId, {
          documentType: 'PASSPORT',
          documentUrl: 'https://storage.suuqzo.test/kyc/passport.pdf',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Admin Review & Self-Approval Prevention', () => {
    it('should prevent administrators from reviewing or approving their own seller applications', async () => {
      // First submit an application for the admin user
      const adminApp = await sellersService.submitApplication(adminUserId, {
        businessName: `Admin Store ${testSuffix}`,
        payoutAccountIdentifier: '+252615000000',
      });

      // Admin tries to self-approve
      await expect(
        sellersService.reviewApplication(adminApp.id, adminUserId, {
          decision: 'APPROVE',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to review and approve a valid seller application with transactional role elevation', async () => {
      const approved = await sellersService.reviewApplication(
        sellerProfileId,
        adminUserId,
        {
          decision: 'APPROVE',
          commissionRate: 0.045,
        },
      );

      expect(approved.verificationStatus).toBe(SellerVerificationStatus.VERIFIED);
      expect(approved.commissionRate.toString()).toBe('0.045');

      // Verify User record has SELLER in assignedRoles and primary role updated
      const applicantUser = await prisma.user.findUnique({
        where: { id: applicantUserId },
      });
      expect(applicantUser?.assignedRoles).toContain(UserRole.SELLER);
      expect(applicantUser?.role).toBe(UserRole.SELLER);

      // Verify AuditLog exists
      const auditLog = await prisma.auditLog.findFirst({
        where: { entityName: 'SellerProfile', entityId: sellerProfileId },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog?.action).toBe('SELLER_APPLICATION_APPROVE');
      expect(auditLog?.userId).toBe(adminUserId);
    });

    it('should allow admin to review and approve KYC document', async () => {
      const reviewedDoc = await sellersService.reviewKycDocument(
        kycDocumentId,
        adminUserId,
        { status: 'APPROVED' },
      );

      expect(reviewedDoc.status).toBe('APPROVED');
      expect(reviewedDoc.verifiedByAdminId).toBe(adminUserId);
      expect(reviewedDoc.verifiedAt).toBeDefined();
    });
  });

  describe('4. KYC Document Privacy & Isolation', () => {
    it('should allow the owner to view their own documents', async () => {
      const docs = await sellersService.getSellerDocuments(
        sellerProfileId,
        applicantUserId,
        UserRole.SELLER,
      );
      expect(docs.length).toBeGreaterThanOrEqual(1);
      expect(docs[0].id).toBe(kycDocumentId);
    });

    it('should allow an admin to view seller documents', async () => {
      const docs = await sellersService.getSellerDocuments(
        sellerProfileId,
        adminUserId,
        UserRole.ADMIN,
      );
      expect(docs.length).toBeGreaterThanOrEqual(1);
    });

    it('should forbid other customers/sellers from viewing private KYC documents', async () => {
      await expect(
        sellersService.getSellerDocuments(
          sellerProfileId,
          otherApplicantUserId,
          UserRole.CUSTOMER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
