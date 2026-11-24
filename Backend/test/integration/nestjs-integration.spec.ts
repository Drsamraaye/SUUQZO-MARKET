import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../src/database/prisma.module.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import 'dotenv/config';

describe('TASK 5: NestJS Integration & Lifecycle Verification', () => {
  let moduleRef: TestingModule;
  let prismaService: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    prismaService = moduleRef.get<PrismaService>(PrismaService);
    await moduleRef.init();
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('should successfully resolve and inject PrismaService from PrismaModule', () => {
    expect(prismaService).toBeDefined();
    expect(typeof prismaService.$connect).toBe('function');
    expect(typeof prismaService.$queryRaw).toBe('function');
  });

  it('should execute a live health check query verifying database connectivity', async () => {
    const result = await prismaService.$queryRaw<
      Array<{ db_connected: boolean }>
    >`SELECT true as db_connected`;

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].db_connected).toBe(true);
  });

  it(
    'should handle database constraint violations and return PrismaClientKnownRequestError with P2002',
    { timeout: 20000 },
    async () => {
      const duplicateKey = `NEST_TEST_DUP_${Date.now()}`;

      // Create the first entry
      await prismaService.platformSetting.create({
        data: {
          key: duplicateKey,
          value: { test: true },
          category: 'NEST_TEST',
        },
      });

      try {
        // Attempt to insert duplicate entry with identical unique key
        await prismaService.platformSetting.create({
          data: {
            key: duplicateKey,
            value: { test: true },
            category: 'NEST_TEST',
          },
        });
        expect.unreachable('Expected P2002 duplicate key error was not thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        const prismaError = err as Prisma.PrismaClientKnownRequestError;
        expect(prismaError.code).toBe('P2002');
      } finally {
        // Cleanup
        await prismaService.platformSetting.deleteMany({
          where: { key: duplicateKey },
        });
      }
    },
  );
});
