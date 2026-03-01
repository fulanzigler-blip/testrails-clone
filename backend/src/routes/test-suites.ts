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
      const { projectId, parentSuiteId, search, page = 1, perPage = 20 } = request.query as any;

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
}
