import { FastifyInstance } from 'fastify';
import { createTestSuiteSchema, updateTestSuiteSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function testSuiteRoutes(fastify: FastifyInstance) {
  // List test suites
  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;
      const { projectId, parentSuiteId, search } = request.query as any;
      const page = parseInt((request.query as any).page) || 1;
      const perPage = Math.min(parseInt((request.query as any).perPage) || 20, 200);

      const where: any = { project: { organizationId } };
      if (projectId) where.projectId = projectId;
      if (parentSuiteId !== undefined) where.parentSuiteId = parentSuiteId || null;
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      const [suites, total] = await Promise.all([
        prisma.testSuite.findMany({
          where,
          include: {
            _count: {
              select: { members: true },
            },
          },
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.testSuite.count({ where }),
      ]);

      const mappedSuites = suites.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        projectId: s.projectId,
        parentSuiteId: s.parentSuiteId,
        testCasesCount: s._count.members,
        createdAt: s.createdAt,
      }));

      return successResponse(reply, mappedSuites, {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (error) {
      logger.error('Error listing test suites:', error);
      return errorResponses.internal(reply);
    }
  });

  // Create test suite
  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const input = createTestSuiteSchema.parse(request.body);
      const organizationId = request.organizationId;

      // Verify project belongs to organization
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId },
      });

      if (!project) {
        return errorResponses.notFound(reply, 'Project');
      }

      const suite = await prisma.testSuite.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId as string,
          parentSuiteId: input.parentSuiteId || null,
        },
      });

      logger.info(`Test suite created: ${suite.id}`);

      return successResponse(reply, {
        id: suite.id,
        name: suite.name,
        description: suite.description,
        projectId: suite.projectId,
        parentSuiteId: suite.parentSuiteId,
        createdAt: suite.createdAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error creating test suite:', error);
      return errorResponses.internal(reply);
    }
  });

  // Get test suite details
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const suite = await prisma.testSuite.findFirst({
        where: {
          id,
          project: { organizationId },
        },
        include: {
          _count: {
            select: { members: true },
          },
          subSuites: true,
        },
      });

      if (!suite) {
        return errorResponses.notFound(reply, 'Test Suite');
      }

      return successResponse(reply, {
        id: suite.id,
        name: suite.name,
        description: suite.description,
        projectId: suite.projectId,
        parentSuiteId: suite.parentSuiteId,
        testCasesCount: suite._count.members,
        subSuites: suite.subSuites.map(ss => ({
          id: ss.id,
          name: ss.name,
        })),
        createdAt: suite.createdAt,
      }, undefined);
    } catch (error) {
      logger.error('Error getting test suite:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update test suite
  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateTestSuiteSchema.parse(request.body);
      const organizationId = request.organizationId;

      const suite = await prisma.testSuite.findFirst({
        where: {
          id,
          project: { organizationId },
        },
      });

      if (!suite) {
        return errorResponses.notFound(reply, 'Test Suite');
      }

      const updatedSuite = await prisma.testSuite.update({
        where: { id },
        data: input,
      });

      return successResponse(reply, {
        id: updatedSuite.id,
        name: updatedSuite.name,
        description: updatedSuite.description,
        projectId: updatedSuite.projectId,
        parentSuiteId: updatedSuite.parentSuiteId,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating test suite:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete test suite
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const suite = await prisma.testSuite.findFirst({
        where: {
          id,
          project: { organizationId },
        },
      });

      if (!suite) {
        return errorResponses.notFound(reply, 'Test Suite');
      }

      await prisma.testSuite.delete({
        where: { id },
      });

      logger.info(`Test suite deleted: ${id}`);

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting test suite:', error);
      return errorResponses.internal(reply);
    }
  });

  // ─── Maestro Flows for Test Suites ─────────────────────────────────────────

  // GET /flows - Get all available maestro flows (pool)
  fastify.get('/flows', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      // Get all flows across all suites in the org
      const flows = await prisma.maestroFlow.findMany({
        where: {
          testSuite: {
            project: { organizationId: request.organizationId },
          },
        },
        include: {
          testSuite: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return successResponse(reply, flows, undefined);
    } catch (error) {
      logger.error('Error listing all flows:', error);
      return errorResponses.handle(reply, error, 'list flows');
    }
  });

  // POST /:id/flows - Save a new flow to a suite
  fastify.post('/:id/flows', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const { name, yaml, orderIndex, savedPath } = request.body as {
        name: string;
        yaml: string;
        orderIndex?: number;
        savedPath?: string;
      };

      // Verify suite belongs to org
      const suite = await prisma.testSuite.findFirst({
        where: { id, project: { organizationId: request.organizationId } },
      });
      if (!suite) return errorResponses.notFound(reply, 'Test Suite');

      const flow = await prisma.maestroFlow.create({
        data: {
          name,
          yaml,
          orderIndex: orderIndex ?? 0,
          savedPath: savedPath || null,
          testSuiteId: id,
        },
      });

      logger.info(`Saved flow "${name}" to suite "${suite.name}"`);
      return successResponse(reply, flow, undefined);
    } catch (error: any) {
      logger.error('Error saving flow to suite:', error);
      return errorResponses.handle(reply, error, 'save flow');
    }
  });

  // GET /:id/flows - Get all flows for a suite
  fastify.get('/:id/flows', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;

      const suite = await prisma.testSuite.findFirst({
        where: { id, project: { organizationId: request.organizationId } },
      });
      if (!suite) return errorResponses.notFound(reply, 'Test Suite');

      const flows = await prisma.maestroFlow.findMany({
        where: { testSuiteId: id },
        orderBy: { orderIndex: 'asc' },
      });

      return successResponse(reply, flows, undefined);
    } catch (error) {
      logger.error('Error listing flows:', error);
      return errorResponses.handle(reply, error, 'list flows');
    }
  });

  // DELETE /:suiteId/flows/:flowId
  fastify.delete('/:suiteId/flows/:flowId', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { suiteId, flowId } = request.params;

      const flow = await prisma.maestroFlow.findFirst({
        where: { id: flowId, testSuite: { project: { organizationId: request.organizationId } } },
      });
      if (!flow) return errorResponses.notFound(reply, 'Maestro Flow');

      await prisma.maestroFlow.delete({ where: { id: flowId } });
      logger.info(`Deleted flow "${flow.name}" from suite`);
      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting flow:', error);
      return errorResponses.handle(reply, error, 'delete flow');
    }
  });

  // POST /:id/flows/:flowId/copy - Copy an existing flow to this suite
  fastify.post('/:id/flows/:flowId/copy', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id: targetSuiteId } = request.params;
      const { flowId } = request.params;

      // Verify target suite belongs to org
      const targetSuite = await prisma.testSuite.findFirst({
        where: { id: targetSuiteId, project: { organizationId: request.organizationId } },
      });
      if (!targetSuite) return errorResponses.notFound(reply, 'Test Suite');

      // Get source flow
      const sourceFlow = await prisma.maestroFlow.findFirst({
        where: { id: flowId, testSuite: { project: { organizationId: request.organizationId } } },
      });
      if (!sourceFlow) return errorResponses.notFound(reply, 'Maestro Flow');

      // Get current max orderIndex
      const maxOrder = await prisma.maestroFlow.aggregate({
        where: { testSuiteId: targetSuiteId },
        _max: { orderIndex: true },
      });
      const nextOrder = (maxOrder._max?.orderIndex ?? -1) + 1;

      // Copy flow to target suite
      const copiedFlow = await prisma.maestroFlow.create({
        data: {
          name: sourceFlow.name,
          yaml: sourceFlow.yaml,
          orderIndex: nextOrder,
          savedPath: sourceFlow.savedPath,
          testSuiteId: targetSuiteId,
        },
      });

      logger.info(`Copied flow "${sourceFlow.name}" to suite "${targetSuite.name}"`);
      return successResponse(reply, copiedFlow, undefined);
    } catch (error: any) {
      logger.error('Error copying flow to suite:', error);
      return errorResponses.handle(reply, error, 'copy flow');
    }
  });
}
