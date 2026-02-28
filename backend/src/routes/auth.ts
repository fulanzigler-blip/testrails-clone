import { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema } from '../types/schemas';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken } from '../utils/auth';
import prisma from '../config/database';
import redis from '../config/redis';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function authRoutes(fastify: FastifyInstance) {
  // Register new user and organization
  fastify.post('/register', async (request, reply) => {
    try {
      const input = registerSchema.parse(request.body);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        return errorResponses.conflict(reply, 'User with this email already exists');
      }

      // Check if organization slug already exists
      const slug = input.organizationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const existingOrg = await prisma.organization.findUnique({
        where: { slug },
      });

      if (existingOrg) {
        return errorResponses.conflict(reply, 'Organization with this name already exists');
      }

      // Create organization
      const organization = await prisma.organization.create({
        data: {
          name: input.organizationName,
          slug,
        },
      });

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'admin', // First user is admin
          organizationId: organization.id,
        },
      });

      // Generate tokens
      const accessToken = generateAccessToken(fastify, user.id);
      const refreshToken = generateRefreshToken(fastify, user.id);

      // Store refresh token in Redis
      await redis.set(`refresh_token:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

      logger.info(`New user registered: ${user.email}`);

      return successResponse(reply, {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        accessToken,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in register:', error);
      return errorResponses.internal(reply);
    }
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      const input = loginSchema.parse(request.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: input.email },
        include: { organization: true },
      });

      if (!user) {
        return errorResponses.unauthorized(reply, 'Invalid email or password');
      }

      // Verify password
      const isValidPassword = await verifyPassword(user.passwordHash, input.password);
      if (!isValidPassword) {
        return errorResponses.unauthorized(reply, 'Invalid email or password');
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const accessToken = generateAccessToken(fastify, user.id);
      const refreshToken = generateRefreshToken(fastify, user.id);

      // Store refresh token in Redis
      await redis.set(`refresh_token:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

      logger.info(`User logged in: ${user.email}`);

      return successResponse(reply, {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in login:', error);
      return errorResponses.internal(reply);
    }
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    try {
      // Get refresh token from cookie
      const refreshToken = request.cookies?.refresh_token;

      if (!refreshToken) {
        return errorResponses.unauthorized(reply, 'Refresh token not found');
      }

      // Verify token
      const decoded = await fastify.jwt.verify<{ userId: string; type: string }>(refreshToken);

      if (decoded.type !== 'refresh') {
        return errorResponses.unauthorized(reply, 'Invalid token type');
      }

      // Check if refresh token exists in Redis
      const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
      if (storedToken !== refreshToken) {
        return errorResponses.unauthorized(reply, 'Invalid refresh token');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return errorResponses.unauthorized(reply, 'User not found');
      }

      // Generate new access token
      const accessToken = generateAccessToken(fastify, user.id);

      return successResponse(reply, { accessToken }, undefined);
    } catch (error: any) {
      logger.error('Error in refresh:', error);
      return errorResponses.unauthorized(reply, 'Invalid or expired refresh token');
    }
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).userId;

      // Remove refresh token from Redis
      await redis.del(`refresh_token:${userId}`);

      logger.info(`User logged out: ${userId}`);

      return reply.code(204).send();
    } catch (error) {
      // Even if token verification fails, clear cookie
      reply.clearCookie('refresh_token');
      return reply.code(204).send();
    }
  });

  // Get current user info
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const userId = (request.user as any).userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true, teams: { include: { team: true } } },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      return successResponse(reply, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          plan: user.organization.plan,
        },
        teams: user.teams.map(ut => ({
          id: ut.team.id,
          name: ut.team.name,
          role: ut.role,
        })),
      }, undefined);
    } catch (error) {
      logger.error('Error in /me:', error);
      return errorResponses.internal(reply);
    }
  });
}
