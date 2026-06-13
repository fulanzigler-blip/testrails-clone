import { beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
// lazyConnect so constructing the client doesn't eagerly fail when Redis isn't
// configured — pure unit tests (parsers, regex, hashing) need no infrastructure.
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });

// Probe DB/Redis once; when unavailable the cleanup hooks no-op so infra-free
// unit tests still run. Integration tests that actually query the DB fail on
// their own queries, as they should.
let infraReady: boolean | null = null;
async function checkInfra(): Promise<boolean> {
  if (infraReady !== null) return infraReady;
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (redis.status !== 'ready' && redis.status !== 'connecting') await redis.connect();
    infraReady = true;
  } catch {
    infraReady = false;
  }
  return infraReady;
}

// Clean up database before each test (only when infra is available)
beforeEach(async () => {
  if (!(await checkInfra())) return;
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

// Clean up Redis after each test (only when infra is available)
afterEach(async () => {
  if (!(await checkInfra())) return;
  await redis.flushdb();
});

// Close connections after all tests
afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (infraReady) await redis.quit().catch(() => {});
});

// Export for use in tests
export { prisma, redis };
