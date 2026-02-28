import { beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Clean up database before each test
beforeEach(async () => {
  // Clean up tables in correct order (respecting foreign keys)
  await prisma.testResult.deleteMany();
  await prisma.bug.deleteMany();
  await prisma.testRun.deleteMany();
  await prisma.testSuiteMember.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.testSuite.deleteMany();
  await prisma.project.deleteMany();
  await prisma.userTeam.deleteMany();
  await prisma.team.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.integration.deleteMany();
});

// Clean up Redis after each test
afterEach(async () => {
  await redis.flushdb();
});

// Close connections after all tests
afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

// Export for use in tests
export { prisma, redis };
