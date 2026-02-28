import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/utils/auth';

const prisma = new PrismaClient();

export async function createTestOrganization(overrides = {}) {
  return prisma.organization.create({
    data: {
      name: 'Test Organization',
      slug: 'test-organization',
      plan: 'free',
      maxUsers: 10,
      ...overrides,
    },
  });
}

export async function createTestUser(organizationId: string, overrides = {}) {
  const password = await hashPassword('TestPassword123!');
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      passwordHash: password,
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      organizationId,
      ...overrides,
    },
  });
}

export async function createTestTeam(organizationId: string, overrides = {}) {
  return prisma.team.create({
    data: {
      name: 'Test Team',
      organizationId,
      ...overrides,
    },
  });
}

export async function createTestProject(organizationId: string, overrides = {}) {
  return prisma.project.create({
    data: {
      name: 'Test Project',
      description: 'A test project',
      organizationId,
      ...overrides,
    },
  });
}

export async function createTestTestSuite(projectId: string, overrides = {}) {
  return prisma.testSuite.create({
    data: {
      name: 'Test Suite',
      description: 'A test suite',
      projectId,
      ...overrides,
    },
  });
}

export async function createTestTestCase(suiteId: string, createdById: string, overrides = {}) {
  return prisma.testCase.create({
    data: {
      title: 'Test Case',
      description: 'A test case',
      expectedResult: 'Expected result',
      priority: 'medium',
      automationType: 'manual',
      suiteId,
      createdById,
      ...overrides,
    },
  });
}

export async function createTestTestRun(
  projectId: string,
  suiteId: string,
  createdById: string,
  overrides = {}
) {
  return prisma.testRun.create({
    data: {
      name: 'Test Run',
      description: 'A test run',
      projectId,
      suiteId,
      createdById,
      status: 'pending',
      ...overrides,
    },
  });
}

export async function createTestTestResult(
  testRunId: string,
  testCaseId: string,
  executedById: string,
  overrides = {}
) {
  return prisma.testResult.create({
    data: {
      testRunId,
      testCaseId,
      status: 'passed',
      executedById,
      ...overrides,
    },
  });
}

export async function createTestBug(overrides = {}) {
  return prisma.bug.create({
    data: {
      title: 'Test Bug',
      description: 'A test bug',
      status: 'open',
      severity: 'major',
      provider: 'jira',
      ...overrides,
    },
  });
}

export async function createTestIntegration(organizationId: string, overrides = {}) {
  return prisma.integration.create({
    data: {
      organizationId,
      type: 'slack',
      name: 'Test Integration',
      config: { webhookUrl: 'https://example.com/webhook' },
      enabled: true,
      ...overrides,
    },
  });
}

export async function createTestNotification(userId: string, overrides = {}) {
  return prisma.notification.create({
    data: {
      userId,
      type: 'test_run_completed',
      title: 'Test Notification',
      message: 'A test notification',
      ...overrides,
    },
  });
}

// Helper to generate random strings
export function randomString(prefix: string = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// Helper to generate random email
export function randomEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}
