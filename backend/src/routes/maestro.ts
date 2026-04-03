import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { successResponse, errorResponses } from '../utils/response';
import { triggerMaestroRun, MAESTRO_WEBHOOK_SECRET } from '../services/maestro';
import { broadcastToOrg } from '../utils/websocket';
import { triggerMaestroSchema, maestroWebhookSchema } from '../types/schemas';
import logger from '../utils/logger';
import prisma from '../config/database';

export default async function maestroRoutes(fastify: FastifyInstance) {
  // POST /trigger - Trigger a Maestro run for a test run
  fastify.post('/trigger', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const body = triggerMaestroSchema.parse(request.body);
      const { testRunId, flowPaths } = body;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: { id: testRunId },
        include: { project: true },
      });

      if (!testRun || testRun.project.organizationId !== organizationId) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const runId = crypto.randomUUID();

      const createdRun = await prisma.maestroRun.create({
        data: {
          testRunId,
          runId,
          status: 'pending',
        },
      });

      // Fire-and-forget: trigger SSH run, then update status and broadcast
      triggerMaestroRun(runId, flowPaths)
        .then(async () => {
          await prisma.maestroRun.update({
            where: { id: createdRun.id },
            data: { status: 'running' },
          });
          broadcastToOrg(organizationId, 'maestro_run_update', {
            maestroRunId: createdRun.id,
            status: 'running',
          });
        })
        .catch((err) => {
          logger.error('Failed to trigger maestro run:', err);
        });

      return successResponse(reply, {
        maestroRunId: createdRun.id,
        runId,
        status: 'pending',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error triggering maestro run:', error);
      return errorResponses.internal(reply);
    }
  });

  // POST /webhook - Receive Maestro run results
  fastify.post('/webhook', async (request: any, reply) => {
    try {
      const secret = request.headers['x-maestro-secret'];
      if (secret !== MAESTRO_WEBHOOK_SECRET) {
        return errorResponses.unauthorized(reply, 'Invalid webhook secret');
      }

      const body = maestroWebhookSchema.parse(request.body);
      const { runId, status, flowCount, passCount, failCount, logUrl, screenshots } = body;

      const maestroRun = await prisma.maestroRun.findUnique({
        where: { runId },
      });

      if (!maestroRun) {
        return errorResponses.notFound(reply, 'Maestro Run');
      }

      await prisma.maestroRun.update({
        where: { runId },
        data: {
          status,
          completedAt: new Date(),
          flowCount,
          passCount,
          failCount,
          logUrl,
        },
      });

      if (screenshots && screenshots.length > 0) {
        await prisma.maestroScreenshot.createMany({
          data: screenshots.map((s) => ({
            maestroRunId: maestroRun.id,
            testCaseId: s.testCaseId,
            stepIndex: s.stepIndex,
            filePath: s.filePath,
            takenAt: new Date(s.takenAt),
          })),
        });
      }

      const testRun = await prisma.testRun.findUnique({
        where: { id: maestroRun.testRunId },
        include: { project: true },
      });

      if (testRun?.project?.organizationId) {
        broadcastToOrg(testRun.project.organizationId, 'maestro_run_update', {
          maestroRunId: maestroRun.id,
          status,
          passCount,
          failCount,
        });
      }

      return reply.code(204).send();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error processing maestro webhook:', error);
      return errorResponses.internal(reply);
    }
  });

  // GET /runs/:testRunId - List all Maestro runs for a test run
  fastify.get('/runs/:testRunId', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { testRunId } = request.params;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: { id: testRunId },
        include: { project: true },
      });

      if (!testRun || testRun.project.organizationId !== organizationId) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const runs = await prisma.maestroRun.findMany({
        where: { testRunId },
        include: {
          screenshots: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return successResponse(reply, runs, undefined);
    } catch (error) {
      logger.error('Error listing maestro runs:', error);
      return errorResponses.internal(reply);
    }
  });
}
