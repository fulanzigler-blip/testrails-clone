import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createTestUser, createTestOrganization } from '../helpers/test-data';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

describe('User Endpoints', () => {
  let app: any;
  let adminAccessToken: string;
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
    await prisma.team.deleteMany();
    await prisma.userTeam.deleteMany();
    await redis.flushdb();

    // Create test organization and admin user
    const org = await createTestOrganization();
    orgId = org.id;
    const adminUser = await createTestUser(org.id, { role: 'admin' });

    // Generate admin access token
    adminAccessToken = app.jwt.sign(
      { userId: adminUser.id, type: 'access' },
      { expiresIn: '15m' }
    );
  });

  describe('GET /api/v1/users', () => {
    beforeEach(async () => {
      // Create additional test users
      await createTestUser(orgId, { role: 'manager' });
      await createTestUser(orgId, { role: 'tester' });
      await createTestUser(orgId, { role: 'viewer' });
    });

    it('should get all users in organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('users');
      expect(result.data.users.length).toBeGreaterThanOrEqual(4);
    });

    it('should not get users without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await prisma.user.findFirst();
      userId = user!.id;
    });

    it('should get user by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${userId}`,
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(userId);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/00000000-0000-0000-0000-000000000000',
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await prisma.user.findFirst();
      userId = user!.id;
    });

    it('should update user profile', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${userId}`,
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
        payload: {
          firstName: 'Updated',
          lastName: 'Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.firstName).toBe('Updated');
      expect(result.data.lastName).toBe('Name');
    });

    it('should update user role', async () => {
      const newUser = await createTestUser(orgId, { role: 'tester' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${newUser.id}`,
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
        payload: {
          role: 'manager',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('manager');
    });

    it('should not update with invalid role', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${userId}`,
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
        payload: {
          role: 'invalid-role',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete user', async () => {
      const user = await createTestUser(orgId, { role: 'tester' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${user.id}`,
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify user is deleted
      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();
    });

    it('should not delete admin user (the last admin)', async () => {
      const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${adminUser!.id}`,
        headers: {
          authorization: `Bearer ${adminAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });
});
