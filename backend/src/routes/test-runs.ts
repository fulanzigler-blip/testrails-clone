import { FastifyInstance } from 'fastify';
import { createTestRunSchema, updateTestRunSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function testRunRoutes(fastify: FastifyInstance) {
  // List test runs
  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;
      const {
        projectId,
        suiteId,
        status,
        createdById,
        fromDate,
        toDate,
        page = 1,
        perPage = 20,
      } = request.query as any;

      // FIX: Parse page and perPage as integers to avoid 500 errors
      const parsedPage = parseInt(page || '1');
      const parsedPerPage = parseInt(perPage || '20');

      const where: any = {
        project: { organizationId },
      };

      if (projectId) where.projectId = projectId;
      if (suiteId) where.suiteId = suiteId;
      if (status) where.status = status;
      if (createdById) where.createdById = createdById;
      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
      }

      const [runs, total] = await Promise.all([
        prisma.testRun.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            _count: {
              select: { results: true },
            },
          },
          // FIX: Use parsed integers instead of strings to avoid 500 errors
      skip: (parsedPage - 1) * parsedPerPage,
          take: perPage,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.testRun.count({ where }),
      ]);

      const mappedRuns = runs.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        projectId: r.projectId,
        suiteId: r.suiteId,
        createdBy: r.createdBy,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        passedCount: r.passedCount,
        failedCount: r.failedCount,
        skippedCount: r.skippedCount,
        blockedCount: r.blockedCount,
        totalTests: r._count.results,
        passRate: r._count.results > 0
          ? Math.round((r.passedCount / r._count.results) * 100)
          : 0,
        environment: r.environment,
        createdAt: r.createdAt,
      }));

      return successResponse(reply, mappedRuns, {
        page: parsedPage,
        perPage: parsedPerPage,
        total,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (error) {
      logger.error('Error listing test runs:', error);
      return errorResponses.internal(reply);
    }
  });

  // Create test run
  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const input = createTestRunSchema.parse(request.body);
      const organizationId = request.organizationId;
      const userId = (request.user as any).userId;

      // Verify project belongs to organization
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId },
      });

      if (!project) {
        return errorResponses.notFound(reply, 'Project');
      }

      // Create test run
      const testRun = await prisma.testRun.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          suiteId: input.suiteId,
          createdById: userId,
          environment: input.environment,
          config: input.config,
        },
      });

      // Get test cases to include
      let caseIds: string[] = [];

      if (input.includeAll && input.suiteId) {
        // Get all cases from suite
        const members = await prisma.testSuiteMember.findMany({
          where: { testSuiteId: input.suiteId },
          select: { testCaseId: true },
        });
        caseIds = members.map(m => m.testCaseId);
      } else if (input.caseIds && input.caseIds.length > 0) {
        caseIds = input.caseIds;
      }

      // Create test results
      if (caseIds.length > 0) {
        await prisma.testResult.createMany({
          data: caseIds.map(caseId => ({
            testRunId: testRun.id,
            testCaseId: caseId,
            status: 'running',
          })),
        });
      }

      logger.info(`Test run created: ${testRun.id} with ${caseIds.length} cases`);

      return successResponse(reply, {
        id: testRun.id,
        name: testRun.name,
        description: testRun.description,
        projectId: testRun.projectId,
        suiteId: testRun.suiteId,
        status: testRun.status,
        totalTests: caseIds.length,
        createdAt: testRun.createdAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error creating test run:', error);
      return errorResponses.internal(reply);
    }
  });

  // Get test run details with results
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: {
          id,
          project: { organizationId },
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          results: {
            include: {
              testCase: {
                select: {
                  id: true,
                  title: true,
                },
              },
              executedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
              bugs: true,
            },
          },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const totalTests = testRun.results.length;
      const passRate = totalTests > 0
        ? Math.round((testRun.passedCount / totalTests) * 100)
        : 0;

      return successResponse(reply, {
        id: testRun.id,
        name: testRun.name,
        description: testRun.description,
        projectId: testRun.projectId,
        suiteId: testRun.suiteId,
        createdBy: testRun.createdBy,
        status: testRun.status,
        startedAt: testRun.startedAt,
        completedAt: testRun.completedAt,
        passedCount: testRun.passedCount,
        failedCount: testRun.failedCount,
        skippedCount: testRun.skippedCount,
        blockedCount: testRun.blockedCount,
        totalTests,
        passRate,
        environment: testRun.environment,
        config: testRun.config,
        createdAt: testRun.createdAt,
        results: testRun.results.map(r => ({
          id: r.id,
          testRunId: r.testRunId,
          testCaseId: r.testCaseId,
          testCaseTitle: r.testCase.title,
          status: r.status,
          comment: r.comment,
          executedBy: r.executedBy,
          executedAt: r.executedAt,
          durationMs: r.durationMs,
          attachments: r.attachments,
          bugs: r.bugs.map(b => ({
            id: b.id,
            title: b.title,
            externalUrl: b.externalUrl,
            severity: b.severity,
          })),
        })),
      }, undefined);
    } catch (error) {
      logger.error('Error getting test run:', error);
      return errorResponses.internal(reply);
    }
  });

  // Start test run
  fastify.post('/:id/start', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: {
          id,
          project: { organizationId },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const updatedRun = await prisma.testRun.update({
        where: { id },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });

      logger.info(`Test run started: ${id}`);

      return successResponse(reply, {
        id: updatedRun.id,
        status: updatedRun.status,
        startedAt: updatedRun.startedAt,
      }, undefined);
    } catch (error) {
      logger.error('Error starting test run:', error);
      return errorResponses.internal(reply);
    }
  });

  // Complete test run
  fastify.post('/:id/complete', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: {
          id,
          project: { organizationId },
        },
        include: {
          _count: {
            select: { results: true },
          },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      // Recalculate counts from results
      const results = await prisma.testResult.findMany({
        where: { testRunId: id },
      });

      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const skipped = results.filter(r => r.status === 'skipped').length;
      const blocked = results.filter(r => r.status === 'blocked').length;

      const updatedRun = await prisma.testRun.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          passedCount: passed,
          failedCount: failed,
          skippedCount: skipped,
          blockedCount: blocked,
        },
      });

      logger.info(`Test run completed: ${id}`);

      return successResponse(reply, {
        id: updatedRun.id,
        status: updatedRun.status,
        completedAt: updatedRun.completedAt,
        summary: {
          total: results.length,
          passed,
          failed,
          skipped,
          blocked,
        },
      }, undefined);
    } catch (error) {
      logger.error('Error completing test run:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete test run
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: {
          id,
          project: { organizationId },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      await prisma.testRun.delete({
        where: { id },
      });

      logger.info(`Test run deleted: ${id}`);

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting test run:', error);
      return errorResponses.internal(reply);
    }
  });
}
