import Fastify from 'fastify';
import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import prisma from '../../dist/config/database';
import redis from '../../dist/config/redis';
import authRoutes from '../../dist/routes/auth';
import organizationRoutes from '../../dist/routes/organizations';
import userRoutes from '../../dist/routes/users';
import projectRoutes from '../../dist/routes/projects';
import testSuiteRoutes from '../../dist/routes/test-suites';
import testCaseRoutes from '../../dist/routes/test-cases';
import testRunRoutes from '../../dist/routes/test-runs';
import testResultRoutes from '../../dist/routes/test-results';
import reportRoutes from '../../dist/routes/reports';
import integrationRoutes from '../../dist/routes/integrations';
import notificationRoutes from '../../dist/routes/notifications';

async function registerPlugins(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'test-secret-key',
  });

  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 hour',
    redis,
    skipOnError: true,
  });
}

async function registerRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          redis: 'connected',
        },
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'error',
        message: 'Service unavailable',
      });
    }
  });

  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(organizationRoutes, { prefix: '/api/v1/organizations' });
  await fastify.register(userRoutes, { prefix: '/api/v1/users' });
  await fastify.register(projectRoutes, { prefix: '/api/v1/projects' });
  await fastify.register(testSuiteRoutes, { prefix: '/api/v1/test-suites' });
  await fastify.register(testCaseRoutes, { prefix: '/api/v1/test-cases' });
  await fastify.register(testRunRoutes, { prefix: '/api/v1/test-runs' });
  await fastify.register(testResultRoutes, { prefix: '/api/v1' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/reports' });
  await fastify.register(integrationRoutes, { prefix: '/api/v1/integrations' });
  await fastify.register(notificationRoutes, { prefix: '/api/v1/notifications' });
}

export async function createTestApp() {
  const app = Fastify({
    logger: false,
  });

  await registerPlugins(app);
  await registerRoutes(app);

  await app.ready();

  return app;
}

export async function generateAccessToken(app: FastifyInstance, userId: string, userRole: string = 'tester') {
  return app.jwt.sign(
    { userId, type: 'access', role: userRole },
    { expiresIn: '15m' }
  );
}

export async function generateRefreshToken(app: FastifyInstance, userId: string) {
  return app.jwt.sign(
    { userId, type: 'refresh' },
    { expiresIn: '7d' }
  );
}

export async function loginAndCreateToken(app: FastifyInstance, email: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });

  const result = JSON.parse(response.payload);
  if (response.statusCode !== 200 || !result.success) {
    throw new Error(`Login failed: ${result.error?.message || 'Unknown error'}`);
  }

  return result.data.accessToken;
}
