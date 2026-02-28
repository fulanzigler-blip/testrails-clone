import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

describe('Auth Endpoints', () => {
  let app: any;

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
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Org',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('user');
      expect(result.data).toHaveProperty('organization');
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data.user.email).toBe('test@example.com');
      expect(result.data.organization.name).toBe('Test Org');
    });

    it('should not register user with existing email', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Org 1',
        },
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'SecurePassword123!',
          firstName: 'Jane',
          lastName: 'Smith',
          organizationName: 'Test Org 2',
        },
      });

      expect(response.statusCode).toBe(409);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('already exists');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          password: '123',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let userEmail: string;
    let userPassword: string;

    beforeEach(async () => {
      userEmail = 'login-test@example.com';
      userPassword = 'LoginPassword123!';

      // Register a user first
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: userEmail,
          password: userPassword,
          firstName: 'Login',
          lastName: 'Test',
          organizationName: 'Login Test Org',
        },
      });
    });

    it('should login with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: userEmail,
          password: userPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('user');
      expect(result.data.user.email).toBe(userEmail);
    });

    it('should not login with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });

    it('should not login with invalid password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: userEmail,
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let accessToken: string;
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and login to get tokens
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'refresh-test@example.com',
          password: 'RefreshPassword123!',
          firstName: 'Refresh',
          lastName: 'Test',
          organizationName: 'Refresh Test Org',
        },
      });

      const registerResult = JSON.parse(registerResponse.payload);
      accessToken = registerResult.data.accessToken;
      userId = registerResult.data.user.id;

      // Generate refresh token manually
      refreshToken = app.jwt.sign(
        { userId, type: 'refresh' },
        { expiresIn: '7d' }
      );

      // Store in Redis
      await redis.set(`refresh_token:${userId}`, refreshToken, 'EX', 7 * 24 * 60 * 60);
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: {
          refresh_token: refreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('accessToken');
    });

    it('should not refresh without refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'me-test@example.com',
          password: 'MePassword123!',
          firstName: 'Me',
          lastName: 'Test',
          organizationName: 'Me Test Org',
        },
      });

      const registerResult = JSON.parse(registerResponse.payload);
      accessToken = registerResult.data.accessToken;
    });

    it('should get current user info with valid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('email');
      expect(result.data).toHaveProperty('organization');
      expect(result.data.email).toBe('me-test@example.com');
    });

    it('should not get user info without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should not get user info with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'logout-test@example.com',
          password: 'LogoutPassword123!',
          firstName: 'Logout',
          lastName: 'Test',
          organizationName: 'Logout Test Org',
        },
      });

      const registerResult = JSON.parse(registerResponse.payload);
      accessToken = registerResult.data.accessToken;
      userId = registerResult.data.user.id;

      // Store a refresh token
      const refreshToken = app.jwt.sign(
        { userId, type: 'refresh' },
        { expiresIn: '7d' }
      );
      await redis.set(`refresh_token:${userId}`, refreshToken, 'EX', 7 * 24 * 60 * 60);
    });

    it('should logout and remove refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.statusCode).toBe(204);

      // Check if refresh token is removed
      const storedToken = await redis.get(`refresh_token:${userId}`);
      expect(storedToken).toBeNull();
    });
  });
});
