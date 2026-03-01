import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createTestUser, createTestOrganization } from '../helpers/test-data';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

describe('Organization Endpoints', () => {
  let app: any;
  let accessToken: string;

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
    await redis.flushdb();

    // Create a test user and get token
    const org = await createTestOrganization();
    const user = await createTestUser(org.id);

    // Generate access token
    accessToken = app.jwt.sign(
      { userId: user.id, type: 'access', role: user.role },
      { expiresIn: '15m' }
    );
  });

  describe('GET /api/v1/organizations', () => {
    it('should get user organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('name');
      expect(result.data).toHaveProperty('slug');
    });

    it('should not get organization without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/organizations/:id', () => {
    let orgId: string;

    beforeEach(async () => {
      const org = await prisma.organization.findFirst();
      orgId = org!.id;
    });

    it('should get organization by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${orgId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(orgId);
    });

    it('should return 404 for non-existent organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/organizations/:id', () => {
    let orgId: string;

    beforeEach(async () => {
      const org = await prisma.organization.findFirst();
      orgId = org!.id;
    });

    it('should update organization name', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${orgId}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          name: 'Updated Organization Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated Organization Name');
    });

    it('should not update with invalid data', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${orgId}`,
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
});
