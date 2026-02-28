import { FastifyInstance } from 'fastify';
import { updateTestResultSchema, createBugSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function testResultRoutes(fastify: FastifyInstance) {
  // Get results for a test run
  fastify.get('/test-runs/:runId/results', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { runId } = request.params;
      const organizationId = request.organizationId;
      const { status, search } = request.query as any;

      // Verify test run belongs to organization
      const testRun = await prisma.testRun.findFirst({
        where: {
          id: runId,
          project: { organizationId },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const where: any = { testRunId: runId };
      if (status) where.status = status;

      const results = await prisma.testResult.findMany({
        where,
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
        orderBy: { createdAt: 'asc' },
      });

      // Filter by search if provided
      let filteredResults = results;
      if (search) {
        filteredResults = results.filter(r =>
          r.testCase.title.toLowerCase().includes(search.toLowerCase())
        );
      }

      const mappedResults = filteredResults.map(r => ({
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
      }));

      return successResponse(reply, mappedResults, undefined);
    } catch (error) {
      logger.error('Error getting test results:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update test result
  fastify.put('/results/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateTestResultSchema.parse(request.body);
      const organizationId = request.organizationId;
      const userId = (request.user as any).userId;

      // Verify result belongs to organization's test run
      const result = await prisma.testResult.findFirst({
        where: {
          id,
          testRun: { project: { organizationId } },
        },
      });

      if (!result) {
        return errorResponses.notFound(reply, 'Test Result');
      }

      // Update test result
      const updatedResult = await prisma.testResult.update({
        where: { id },
        data: {
          ...input,
          executedBy: input.status !== result.status ? userId : undefined,
          executedAt: input.status !== result.status ? new Date() : undefined,
        },
      });

      // Update test run counts
      if (input.status && input.status !== result.status) {
        const testRun = await prisma.testRun.findUnique({
          where: { id: result.testRunId },
          include: {
            _count: { select: { results: true } },
          },
        });

        if (testRun) {
          // Recalculate counts
          const allResults = await prisma.testResult.findMany({
            where: { testRunId: result.testRunId },
          });

          const passed = allResults.filter(r => r.status === 'passed').length;
          const failed = allResults.filter(r => r.status === 'failed').length;
          const skipped = allResults.filter(r => r.status === 'skipped').length;
          const blocked = allResults.filter(r => r.status === 'blocked').length;

          await prisma.testRun.update({
            where: { id: result.testRunId },
            data: {
              passedCount: passed,
              failedCount: failed,
              skippedCount: skipped,
              blockedCount: blocked,
            },
          });
        }
      }

      logger.info(`Test result updated: ${id}`);

      return successResponse(reply, {
        id: updatedResult.id,
        status: updatedResult.status,
        comment: updatedResult.comment,
        executedAt: updatedResult.executedAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating test result:', error);
      return errorResponses.internal(reply);
    }
  });

  // Create bug from failed test
  fastify.post('/results/:id/bug', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = createBugSchema.parse(request.body);
      const organizationId = request.organizationId;

      // Verify result belongs to organization's test run
      const result = await prisma.testResult.findFirst({
        where: {
          id,
          testRun: { project: { organizationId } },
        },
        include: {
          testCase: true,
          testRun: true,
        },
      });

      if (!result) {
        return errorResponses.notFound(reply, 'Test Result');
      }

      // Create bug
      const bug = await prisma.bug.create({
        data: {
          testResultId: id,
          title: input.title,
          description: input.description,
          severity: input.severity,
          provider: input.provider,
        },
      });

      // TODO: Integrate with external bug tracker (Jira, GitHub, etc.)
      // This would involve calling the external API and storing the external ID

      logger.info(`Bug created: ${bug.id} from test result ${id}`);

      return successResponse(reply, {
        id: bug.id,
        title: bug.title,
        externalId: bug.externalId,
        externalUrl: bug.externalUrl,
        provider: bug.provider,
        severity: bug.severity,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error creating bug:', error);
      return errorResponses.internal(reply);
    }
  });
}
