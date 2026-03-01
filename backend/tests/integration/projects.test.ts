import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createTestUser, createTestOrganization, createTestProject, createTestTestSuite } from '../helpers/test-data';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

describe('Project & Test Suite Endpoints', () => {
  let app: any;
  let accessToken: string;
  let orgId: string;

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
    await redis.flushdb();

    // Create test organization and user
    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser(org.id);

    // Generate access token
    accessToken = app.jwt.sign(
      { userId: user.id, type: 'access', role: user.role },
      { expiresIn: '15m' }
    );
  });

  describe('Project Endpoints', () => {
    describe('POST /api/v1/projects', () => {
      it('should create a new project', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/projects',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Test Project',
            description: 'A test project',
          },
        });

        expect(response.statusCode).toBe(201);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Test Project');
        expect(result.data.description).toBe('A test project');
      });

      it('should not create project with invalid data', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/projects',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: '', // Invalid empty name
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /api/v1/projects', () => {
      beforeEach(async () => {
        await createTestProject(orgId, { name: 'Project 1' });
        await createTestProject(orgId, { name: 'Project 2' });
      });

      it('should get all projects', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/projects',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('projects');
        expect(result.data.projects.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('GET /api/v1/projects/:id', () => {
      let projectId: string;

      beforeEach(async () => {
        const project = await createTestProject(orgId);
        projectId = project.id;
      });

      it('should get project by id', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/projects/${projectId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.id).toBe(projectId);
      });

      it('should return 404 for non-existent project', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/projects/00000000-0000-0000-0000-000000000000',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /api/v1/projects/:id', () => {
      let projectId: string;

      beforeEach(async () => {
        const project = await createTestProject(orgId);
        projectId = project.id;
      });

      it('should update project', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/projects/${projectId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Updated Project Name',
            description: 'Updated description',
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Updated Project Name');
      });
    });

    describe('DELETE /api/v1/projects/:id', () => {
      it('should delete project', async () => {
        const project = await createTestProject(orgId);

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/v1/projects/${project.id}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(204);

        // Verify project is deleted
        const deletedProject = await prisma.project.findUnique({
          where: { id: project.id },
        });
        expect(deletedProject).toBeNull();
      });
    });
  });

  describe('Test Suite Endpoints', () => {
    let projectId: string;

    beforeEach(async () => {
      const project = await createTestProject(orgId);
      projectId = project.id;
    });

    describe('POST /api/v1/test-suites', () => {
      it('should create a new test suite', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/test-suites',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Test Suite',
            description: 'A test suite',
            projectId,
          },
        });

        expect(response.statusCode).toBe(201);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Test Suite');
      });

      it('should not create test suite with invalid projectId', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/test-suites',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Test Suite',
            projectId: '00000000-0000-0000-0000-000000000000',
          },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('GET /api/v1/test-suites', () => {
      beforeEach(async () => {
        await createTestTestSuite(projectId, { name: 'Suite 1' });
        await createTestTestSuite(projectId, { name: 'Suite 2' });
      });

      it('should get all test suites', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/test-suites',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('testSuites');
        expect(result.data.testSuites.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('GET /api/v1/test-suites/:id', () => {
      let suiteId: string;

      beforeEach(async () => {
        const suite = await createTestTestSuite(projectId);
        suiteId = suite.id;
      });

      it('should get test suite by id', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/test-suites/${suiteId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.id).toBe(suiteId);
      });
    });

    describe('PATCH /api/v1/test-suites/:id', () => {
      let suiteId: string;

      beforeEach(async () => {
        const suite = await createTestTestSuite(projectId);
        suiteId = suite.id;
      });

      it('should update test suite', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/test-suites/${suiteId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Updated Suite Name',
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Updated Suite Name');
      });
    });

    describe('DELETE /api/v1/test-suites/:id', () => {
      it('should delete test suite', async () => {
        const suite = await createTestTestSuite(projectId);

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/v1/test-suites/${suite.id}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(204);

        // Verify suite is deleted
        const deletedSuite = await prisma.testSuite.findUnique({
          where: { id: suite.id },
        });
        expect(deletedSuite).toBeNull();
      });
    });
  });
});
