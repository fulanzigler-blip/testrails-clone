import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createTestOrganization,
  createTestUser,
  createTestTeam,
  createTestProject,
  createTestTestSuite,
  createTestTestCase,
  createTestTestRun,
  createTestTestResult,
  createTestBug,
  createTestIntegration,
  createTestNotification,
  randomString,
  randomEmail,
} from '../helpers/test-data';

const prisma = new PrismaClient();

describe('Test Data Factories', () => {
  beforeEach(async () => {
    // Clean up before each test
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

  afterEach(async () => {
    // Clean up after each test
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

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createTestOrganization', () => {
    it('should create a test organization', async () => {
      const org = await createTestOrganization();

      expect(org).toBeDefined();
      expect(org.id).toBeDefined();
      expect(org.name).toBe('Test Organization');
      expect(org.slug).toBe('test-organization');
      expect(org.plan).toBe('free');
      expect(org.maxUsers).toBe(10);
    });

    it('should create organization with overrides', async () => {
      const org = await createTestOrganization({
        name: 'Custom Org',
        slug: 'custom-slug',
        plan: 'enterprise',
        maxUsers: 100,
      });

      expect(org.name).toBe('Custom Org');
      expect(org.slug).toBe('custom-slug');
      expect(org.plan).toBe('enterprise');
      expect(org.maxUsers).toBe(100);
    });
  });

  describe('createTestUser', () => {
    it('should create a test user', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toContain('@example.com');
      expect(user.firstName).toBe('Test');
      expect(user.lastName).toBe('User');
      expect(user.role).toBe('admin');
      expect(user.organizationId).toBe(org.id);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe('TestPassword123!');
    });

    it('should create user with custom data', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id, {
        email: 'custom@example.com',
        firstName: 'Custom',
        lastName: 'Name',
        role: 'manager',
      });

      expect(user.email).toBe('custom@example.com');
      expect(user.firstName).toBe('Custom');
      expect(user.lastName).toBe('Name');
      expect(user.role).toBe('manager');
    });
  });

  describe('createTestTeam', () => {
    it('should create a test team', async () => {
      const org = await createTestOrganization();
      const team = await createTestTeam(org.id);

      expect(team).toBeDefined();
      expect(team.id).toBeDefined();
      expect(team.name).toBe('Test Team');
      expect(team.organizationId).toBe(org.id);
    });
  });

  describe('createTestProject', () => {
    it('should create a test project', async () => {
      const org = await createTestOrganization();
      const project = await createTestProject(org.id);

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('A test project');
      expect(project.organizationId).toBe(org.id);
    });
  });

  describe('createTestTestSuite', () => {
    it('should create a test suite', async () => {
      const org = await createTestOrganization();
      const project = await createTestProject(org.id);
      const suite = await createTestTestSuite(project.id);

      expect(suite).toBeDefined();
      expect(suite.id).toBeDefined();
      expect(suite.name).toBe('Test Suite');
      expect(suite.description).toBe('A test suite');
      expect(suite.projectId).toBe(project.id);
    });
  });

  describe('createTestTestCase', () => {
    it('should create a test case', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const project = await createTestProject(org.id);
      const suite = await createTestTestSuite(project.id);
      const testCase = await createTestTestCase(suite.id, user.id);

      expect(testCase).toBeDefined();
      expect(testCase.id).toBeDefined();
      expect(testCase.title).toBe('Test Case');
      expect(testCase.description).toBe('A test case');
      expect(testCase.expectedResult).toBe('Expected result');
      expect(testCase.priority).toBe('medium');
      expect(testCase.automationType).toBe('manual');
      expect(testCase.suiteId).toBe(suite.id);
      expect(testCase.createdById).toBe(user.id);
    });
  });

  describe('createTestTestRun', () => {
    it('should create a test run', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const project = await createTestProject(org.id);
      const suite = await createTestTestSuite(project.id);
      const testRun = await createTestTestRun(project.id, suite.id, user.id);

      expect(testRun).toBeDefined();
      expect(testRun.id).toBeDefined();
      expect(testRun.name).toBe('Test Run');
      expect(testRun.description).toBe('A test run');
      expect(testRun.projectId).toBe(project.id);
      expect(testRun.suiteId).toBe(suite.id);
      expect(testRun.createdById).toBe(user.id);
      expect(testRun.status).toBe('pending');
    });
  });

  describe('createTestTestResult', () => {
    it('should create a test result', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const project = await createTestProject(org.id);
      const suite = await createTestTestSuite(project.id);
      const testCase = await createTestTestCase(suite.id, user.id);
      const testRun = await createTestTestRun(project.id, suite.id, user.id);
      const testResult = await createTestTestResult(testRun.id, testCase.id, user.id);

      expect(testResult).toBeDefined();
      expect(testResult.id).toBeDefined();
      expect(testResult.testRunId).toBe(testRun.id);
      expect(testResult.testCaseId).toBe(testCase.id);
      expect(testResult.status).toBe('passed');
      expect(testResult.executedById).toBe(user.id);
    });
  });

  describe('createTestBug', () => {
    it('should create a test bug', async () => {
      const bug = await createTestBug();

      expect(bug).toBeDefined();
      expect(bug.id).toBeDefined();
      expect(bug.title).toBe('Test Bug');
      expect(bug.description).toBe('A test bug');
      expect(bug.status).toBe('open');
      expect(bug.severity).toBe('major');
      expect(bug.provider).toBe('jira');
    });
  });

  describe('createTestIntegration', () => {
    it('should create a test integration', async () => {
      const org = await createTestOrganization();
      const integration = await createTestIntegration(org.id);

      expect(integration).toBeDefined();
      expect(integration.id).toBeDefined();
      expect(integration.organizationId).toBe(org.id);
      expect(integration.type).toBe('slack');
      expect(integration.name).toBe('Test Integration');
      expect(integration.enabled).toBe(true);
    });
  });

  describe('createTestNotification', () => {
    it('should create a test notification', async () => {
      const org = await createTestOrganization();
      const user = await createTestUser(org.id);
      const notification = await createTestNotification(user.id);

      expect(notification).toBeDefined();
      expect(notification.id).toBeDefined();
      expect(notification.userId).toBe(user.id);
      expect(notification.type).toBe('test_run_completed');
      expect(notification.title).toBe('Test Notification');
      expect(notification.message).toBe('A test notification');
    });
  });

  describe('randomString', () => {
    it('should generate unique strings', () => {
      const str1 = randomString();
      const str2 = randomString();

      expect(str1).toBeDefined();
      expect(str2).toBeDefined();
      expect(str1).not.toBe(str2);
    });

    it('should include prefix when provided', () => {
      const str = randomString('prefix');
      expect(str).toMatch(/^prefix-/);
    });
  });

  describe('randomEmail', () => {
    it('should generate valid email addresses', () => {
      const email = randomEmail();

      expect(email).toMatch(/^[a-zA-Z0-9._%+-]+@example\.com$/);
    });

    it('should generate unique emails', () => {
      const email1 = randomEmail();
      const email2 = randomEmail();

      expect(email1).not.toBe(email2);
    });
  });
});
