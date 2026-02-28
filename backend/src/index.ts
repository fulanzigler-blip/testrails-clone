import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import prisma from './config/database';
import redis from './config/redis';
import logger from './utils/logger';
import * as authMiddleware from './middleware/auth';

// Import routes
import authRoutes from './routes/auth';
import organizationRoutes from './routes/organizations';
import userRoutes from './routes/users';
import projectRoutes from './routes/projects';
import testSuiteRoutes from './routes/test-suites';
import testCaseRoutes from './routes/test-cases';
import testRunRoutes from './routes/test-runs';
import testResultRoutes from './routes/test-results';
import reportRoutes from './routes/reports';
import integrationRoutes from './routes/integrations';
import notificationRoutes from './routes/notifications';

// Create Fastify instance
const fastify = Fastify({
  logger: false, // Using Winston instead
});

// Register plugins
async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // JWT
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this',
    cookie: {
      cookieName: 'refresh_token',
      signed: false,
    },
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
    timeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '1 hour',
    redis,
    skipOnError: true,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    errorResponseBuilder: (req, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        details: [
          {
            limit: context.limit,
            reset: new Date(Date.now() + context.ttl).toISOString(),
          },
        ],
      },
    }),
  });

  // WebSocket
  await fastify.register(websocket);

  // Attach middleware
  fastify.decorate('authenticate', authMiddleware.authenticate);
  fastify.decorate('authorize', authMiddleware.authorize);
  fastify.decorate('getOrganizationContext', authMiddleware.getOrganizationContext);

  // Attach Prisma and Redis to request
  fastify.addHook('onRequest', async (request, reply) => {
    (request.server as any).prisma = prisma;
  });
}

// Register routes
async function registerRoutes() {
  // Health check
  fastify.get('/health', async (request, reply) => {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;
      // Check Redis connection
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
      logger.error('Health check failed:', error);
      return reply.code(503).send({
        status: 'error',
        message: 'Service unavailable',
      });
    }
  });

  // WebSocket connection for real-time updates
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      connection.socket.on('message', message => {
        // Echo for now - implement real-time updates
        connection.socket.send(JSON.stringify({ type: 'pong', data: message.toString() }));
      });

      connection.socket.on('close', () => {
        logger.info('WebSocket connection closed');
      });
    });
  });

  // API routes
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

// Start server
async function start() {
  try {
    await registerPlugins();
    await registerRoutes();

    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    logger.info(`Server listening on http://${host}:${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully...');

  try {
    await fastify.close();
    await prisma.$disconnect();
    await redis.quit();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
start();
