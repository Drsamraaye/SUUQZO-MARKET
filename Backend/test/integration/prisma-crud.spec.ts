import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const { Pool } = pg;
import 'dotenv/config';

describe('TASK 4: Prisma Live Database CRUD Integration Test', () => {
  let pool: pg.Pool;
  let prisma: PrismaClient;
  const testKey = `TEST_SETTING_${Date.now()}`;

  beforeAll(async () => {
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    // Safety cleanup: ensure test record is purged
    await prisma.platformSetting.deleteMany({
      where: { key: testKey },
    });
    await prisma.$disconnect();
    await pool.end();
  });

  it('1. CREATE: should insert a new record into Supabase PostgreSQL', async () => {
    const created = await prisma.platformSetting.create({
      data: {
        key: testKey,
        value: { env: 'test', initialized: true },
        category: 'INTEGRATION_TEST',
        description: 'Temporary record for CRUD verification',
        isPublic: false,
      },
    });

    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.key).toBe(testKey);
    expect(created.category).toBe('INTEGRATION_TEST');
  });

  it('2. READ: should retrieve the inserted record from the live database', async () => {
    const found = await prisma.platformSetting.findUnique({
      where: { key: testKey },
    });

    expect(found).not.toBeNull();
    expect(found?.key).toBe(testKey);
    expect(found?.description).toBe('Temporary record for CRUD verification');
  });

  it('3. UPDATE: should update the record in the live database', async () => {
    const updated = await prisma.platformSetting.update({
      where: { key: testKey },
      data: {
        description: 'Updated description for CRUD verification',
        value: { env: 'test', initialized: true, updated: true },
      },
    });

    expect(updated.description).toBe(
      'Updated description for CRUD verification'
    );
  });

  it('4. DELETE: should delete the test record safely from the database', async () => {
    const deleted = await prisma.platformSetting.delete({
      where: { key: testKey },
    });

    expect(deleted.key).toBe(testKey);

    const verifyAbsence = await prisma.platformSetting.findUnique({
      where: { key: testKey },
    });
    expect(verifyAbsence).toBeNull();
  });
});
