import { FastifyInstance } from 'fastify';
import {
  createTestCaseSchema,
  updateTestCaseSchema,
  bulkDeleteSchema,
} from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';
import { sanitizeInput, sanitizeObject } from '../utils/security';

export default async function testCaseRoutes(fastify: FastifyInstance) {
  // List test cases
  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;
      const {
        suiteId,
        projectId,
        status,
        priority,
        tags,
        search,
        page = 1,
        perPage = 20,
        sort = 'createdAt',
        order = 'desc',
      } = request.query as any;

      const where: any = {
        suite: { project: { organizationId } },
      };

      if (suiteId) where.suiteId = suiteId;
      if (projectId) where.suite = { projectId };
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (tags) where.tags = { hasSome: Array.isArray(tags) ? tags : [tags] };
      // SECURITY: Sanitize search input to prevent XSS (FIX #2)
      if (search) {
        const sanitizedSearch = sanitizeInput(search);
        where.OR = [
          { title: { contains: sanitizedSearch, mode: 'insensitive' } },
          { description: { contains: sanitizedSearch, mode: 'insensitive' } },
        ];
      }

      const orderBy: any = {};
      if (sort === 'priority') {
        orderBy.priority = order === 'asc' ? 'low' : 'critical';
      } else {
        orderBy[sort] = order;
      }

      const [testCases, total] = await Promise.all([
        prisma.testCase.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy,
        }),
        prisma.testCase.count({ where }),
      ]);

      const mappedCases = testCases.map(tc => ({
        id: tc.id,
        title: tc.title,
        description: tc.description,
        steps: tc.steps,
        expectedResult: tc.expectedResult,
        priority: tc.priority,
        automationType: tc.automationType,
        suiteId: tc.suiteId,
        createdBy: tc.createdBy,
        version: tc.version,
        status: tc.status,
        tags: tc.tags,
        createdAt: tc.createdAt,
        updatedAt: tc.updatedAt,
      }));

      return successResponse(reply, mappedCases, {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (error) {
      logger.error('Error listing test cases:', error);
      return errorResponses.internal(reply);
    }
  });

  // Create test case
  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const input = createTestCaseSchema.parse(request.body);
      const organizationId = request.organizationId;
      const userId = (request.user as any).userId;

      // SECURITY: Sanitize input to prevent XSS (FIX #2)
      const sanitizedInput = sanitizeObject({
        title: input.title,
        description: input.description,
        steps: input.steps,
        expectedResult: input.expectedResult,
      });

      // Verify suite belongs to organization's project
      if (input.suiteId) {
        const suite = await prisma.testSuite.findFirst({
          where: {
            id: input.suiteId,
            project: { organizationId },
          },
        });

        if (!suite) {
          return errorResponses.notFound(reply, 'Test Suite');
        }
      }

      const testCase = await prisma.testCase.create({
        data: {
          title: input.title,
          description: input.description,
          steps: input.steps,
          expectedResult: input.expectedResult,
          priority: input.priority,
          automationType: input.automationType,
          suiteId: input.suiteId || null,
          createdById: userId,
          tags: input.tags,
          customFields: input.customFields,
        },
      });

      // Add to suite members if suite is provided
      if (input.suiteId) {
        await prisma.testSuiteMember.create({
          data: {
            testSuiteId: input.suiteId,
            testCaseId: testCase.id,
          },
        });
      }

      logger.info(`Test case created: ${testCase.id}`);

      return successResponse(reply, {
        id: testCase.id,
        title: testCase.title,
        description: testCase.description,
        steps: testCase.steps,
        expectedResult: testCase.expectedResult,
        priority: testCase.priority,
        automationType: testCase.automationType,
        suiteId: testCase.suiteId,
        version: testCase.version,
        status: testCase.status,
        tags: testCase.tags,
        createdAt: testCase.createdAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error creating test case:', error);
      return errorResponses.internal(reply);
    }
  });

  // Get test case details
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const testCase = await prisma.testCase.findFirst({
        where: {
          id,
          suite: { project: { organizationId } },
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!testCase) {
        return errorResponses.notFound(reply, 'Test Case');
      }

      return successResponse(reply, {
        id: testCase.id,
        title: testCase.title,
        description: testCase.description,
        steps: testCase.steps,
        expectedResult: testCase.expectedResult,
        priority: testCase.priority,
        automationType: testCase.automationType,
        suiteId: testCase.suiteId,
        createdBy: testCase.createdBy,
        version: testCase.version,
        status: testCase.status,
        tags: testCase.tags,
        customFields: testCase.customFields,
        createdAt: testCase.createdAt,
        updatedAt: testCase.updatedAt,
      }, undefined);
    } catch (error) {
      logger.error('Error getting test case:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update test case
  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateTestCaseSchema.parse(request.body);
      const organizationId = request.organizationId;

      const testCase = await prisma.testCase.findFirst({
        where: {
          id,
          suite: { project: { organizationId } },
        },
      });

      if (!testCase) {
        return errorResponses.notFound(reply, 'Test Case');
      }

      // Increment version on update
      const updatedCase = await prisma.testCase.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          steps: input.steps,
          expectedResult: input.expectedResult,
          priority: input.priority,
          automationType: input.automationType,
          suiteId: input.suiteId !== undefined ? input.suiteId : undefined,
          tags: input.tags,
          status: input.status,
          customFields: input.customFields,
          version: { increment: 1 },
        },
      });

      logger.info(`Test case updated: ${id}`);

      return successResponse(reply, {
        id: updatedCase.id,
        title: updatedCase.title,
        version: updatedCase.version,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating test case:', error);
      return errorResponses.internal(reply);
    }
  });

  // Clone test case
  fastify.post('/:id/clone', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;
      const userId = (request.user as any).userId;

      const original = await prisma.testCase.findFirst({
        where: {
          id,
          suite: { project: { organizationId } },
        },
      });

      if (!original) {
        return errorResponses.notFound(reply, 'Test Case');
      }

      const cloned = await prisma.testCase.create({
        data: {
          title: `Copy of ${original.title}`,
          description: original.description,
          steps: original.steps,
          expectedResult: original.expectedResult,
          priority: original.priority,
          automationType: original.automationType,
          suiteId: original.suiteId,
          createdById: userId,
          version: 1,
          status: 'active',
          tags: original.tags,
          customFields: original.customFields,
        },
      });

      // Add to same suite if applicable
      if (cloned.suiteId) {
        await prisma.testSuiteMember.create({
          data: {
            testSuiteId: cloned.suiteId,
            testCaseId: cloned.id,
          },
        });
      }

      logger.info(`Test case cloned: ${cloned.id} from ${id}`);

      return successResponse(reply, {
        id: cloned.id,
        title: cloned.title,
        version: cloned.version,
      }, undefined);
    } catch (error) {
      logger.error('Error cloning test case:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete test case
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const testCase = await prisma.testCase.findFirst({
        where: {
          id,
          suite: { project: { organizationId } },
        },
      });

      if (!testCase) {
        return errorResponses.notFound(reply, 'Test Case');
      }

      await prisma.testCase.delete({
        where: { id },
      });

      logger.info(`Test case deleted: ${id}`);

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting test case:', error);
      return errorResponses.internal(reply);
    }
  });

  // Bulk delete test cases
  fastify.post('/bulk-delete', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { ids } = bulkDeleteSchema.parse(request.body);
      const organizationId = request.organizationId;

      // Verify all cases belong to organization
      const cases = await prisma.testCase.findMany({
        where: {
          id: { in: ids },
          suite: { project: { organizationId } },
        },
      });

      if (cases.length !== ids.length) {
        return errorResponses.notFound(reply, 'Some test cases not found');
      }

      await prisma.testCase.deleteMany({
        where: {
          id: { in: ids },
          suite: { project: { organizationId } },
        },
      });

      logger.info(`Bulk deleted test cases: ${ids.length} cases`);

      return reply.code(204).send();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error bulk deleting test cases:', error);
      return errorResponses.internal(reply);
    }
  });
}
