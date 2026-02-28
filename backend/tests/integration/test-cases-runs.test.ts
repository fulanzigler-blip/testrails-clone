import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import {
  createTestUser,
  createTestOrganization,
  createTestProject,
  createTestTestSuite,
  createTestTestCase,
  createTestTestRun,
  createTestTestResult,
} from '../helpers/test-data';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

describe('Test Cases, Test Runs & Test Results Endpoints', () => {
  let app: any;
  let accessToken: string;
  let orgId: string;
  let projectId: string;
  let suiteId: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up database
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.project.deleteMany();
    await prisma.testSuite.deleteMany();
    await prisma.testCase.deleteMany();
    await prisma.testRun.deleteMany();
    await prisma.testResult.deleteMany();
    await redis.flushdb();

    // Create test data
    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser(org.id);
    userId = user.id;
    const project = await createTestProject(org.id);
    projectId = project.id;
    const suite = await createTestTestSuite(project.id);
    suiteId = suite.id;

    // Generate access token
    accessToken = app.jwt.sign(
      { userId: user.id, type: 'access' },
      { expiresIn: '15m' }
    );
  });

  describe('Test Case Endpoints', () => {
    describe('POST /api/v1/test-cases', () => {
      it('should create a new test case', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/test-cases',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            title: 'Test Case 1',
            description: 'Description',
            expectedResult: 'Expected',
            steps: [{ step: 'Step 1' }],
            priority: 'high',
            automationType: 'manual',
            suiteId,
          },
        });

        expect(response.statusCode).toBe(201);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.title).toBe('Test Case 1');
      });
    });

    describe('GET /api/v1/test-cases', () => {
      beforeEach(async () => {
        await createTestTestCase(suiteId, userId, { title: 'Case 1' });
        await createTestTestCase(suiteId, userId, { title: 'Case 2' });
      });

      it('should get all test cases', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/test-cases',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('testCases');
        expect(result.data.testCases.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('PATCH /api/v1/test-cases/:id', () => {
      let testCaseId: string;

      beforeEach(async () => {
        const testCase = await createTestTestCase(suiteId, userId);
        testCaseId = testCase.id;
      });

      it('should update test case', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/test-cases/${testCaseId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            title: 'Updated Title',
            priority: 'critical',
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.title).toBe('Updated Title');
        expect(result.data.priority).toBe('critical');
      });
    });
  });

  describe('Test Run Endpoints', () => {
    describe('POST /api/v1/test-runs', () => {
      it('should create a new test run', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/test-runs',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Test Run 1',
            description: 'A test run',
            projectId,
            suiteId,
          },
        });

        expect(response.statusCode).toBe(201);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Test Run 1');
        expect(result.data.status).toBe('pending');
      });
    });

    describe('GET /api/v1/test-runs', () => {
      beforeEach(async () => {
        await createTestTestRun(projectId, suiteId, userId, { name: 'Run 1' });
        await createTestTestRun(projectId, suiteId, userId, { name: 'Run 2' });
      });

      it('should get all test runs', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/test-runs',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('testRuns');
        expect(result.data.testRuns.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('PATCH /api/v1/test-runs/:id', () => {
      let testRunId: string;

      beforeEach(async () => {
        const testRun = await createTestTestRun(projectId, suiteId, userId);
        testRunId = testRun.id;
      });

      it('should update test run status', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/test-runs/${testRunId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            status: 'running',
            environment: 'staging',
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.status).toBe('running');
      });
    });
  });

  describe('Test Result Endpoints', () => {
    let testCaseId: string;
    let testRunId: string;

    beforeEach(async () => {
      const testCase = await createTestTestCase(suiteId, userId);
      testCaseId = testCase.id;
      const testRun = await createTestTestRun(projectId, suiteId, userId);
      testRunId = testRun.id;
    });

    describe('POST /api/v1/test-results', () => {
      it('should create a new test result', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/test-results',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            testRunId,
            testCaseId,
            status: 'passed',
            comment: 'Test passed successfully',
          },
        });

        expect(response.statusCode).toBe(201);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.status).toBe('passed');
      });
    });

    describe('GET /api/v1/test-results', () => {
      beforeEach(async () => {
        await createTestTestResult(testRunId, testCaseId, userId, { status: 'passed' });
        await createTestTestResult(testRunId, testCaseId, userId, { status: 'failed' });
      });

      it('should get all test results', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/test-results',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('testResults');
        expect(result.data.testResults.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('PATCH /api/v1/test-results/:id', () => {
      let testResultId: string;

      beforeEach(async () => {
        const testResult = await createTestTestResult(testRunId, testCaseId, userId);
        testResultId = testResult.id;
      });

      it('should update test result status', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/test-results/${testResultId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            status: 'failed',
            comment: 'Test failed due to bug',
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.status).toBe('failed');
        expect(result.data.comment).toBe('Test failed due to bug');
      });
    });
  });
});
