import { FastifyInstance } from 'fastify';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function reportRoutes(fastify: FastifyInstance) {
  // Get summary report for organization
  fastify.get('/summary', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;
      const { projectId, fromDate, toDate } = request.query as any;

      const where: any = {
        project: { organizationId },
      };

      if (projectId) where.projectId = projectId;
      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
      }

      // Get aggregated stats
      const [testRuns, totalTestCases, totalProjects, recentRuns] = await Promise.all([
        prisma.testRun.count({ where }),
        prisma.testCase.count({
          where: {
            suite: { project: { organizationId } },
          },
        }),
        prisma.project.count({ where: { organizationId } }),
        prisma.testRun.findMany({
          where,
          include: {
            _count: {
              select: { results: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      ]);

      // Calculate pass rates
      let totalExecuted = 0;
      let totalPassed = 0;

      recentRuns.forEach(run => {
        totalExecuted += run._count.results;
        totalPassed += run.passedCount;
      });

      const averagePassRate = totalExecuted > 0
        ? Math.round((totalPassed / totalExecuted) * 100)
        : 0;

      // Get top failing test cases
      const failedResults = await prisma.testResult.findMany({
        where: {
          status: 'failed',
          testRun: {
            project: { organizationId },
          },
        },
        include: {
          testCase: true,
        },
      });

      const failureCounts: Record<string, { count: number; title: string }> = {};
      failedResults.forEach(r => {
        const key = r.testCaseId;
        if (!failureCounts[key]) {
          failureCounts[key] = { count: 0, title: r.testCase.title };
        }
        failureCounts[key].count++;
      });

      const topFailures = Object.entries(failureCounts)
        .map(([id, data]) => ({
          testCaseId: id,
          testCaseTitle: data.title,
          failureCount: data.count,
          percentage: Math.round((data.count / totalExecuted) * 100),
        }))
        .sort((a, b) => b.failureCount - a.failureCount)
        .slice(0, 10);

      // Generate trend data
      const trendDates: string[] = [];
      const trendPassRates: number[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const dateStr = date.toISOString().split('T')[0];
        trendDates.push(dateStr);

        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        const dayRuns = await prisma.testRun.findMany({
          where: {
            ...where,
            createdAt: { gte: date, lt: endDate },
          },
          include: {
            _count: { select: { results: true } },
          },
        });

        let dayPassed = 0;
        let dayTotal = 0;
        dayRuns.forEach(r => {
          dayPassed += r.passedCount;
          dayTotal += r._count.results;
        });

        trendPassRates.push(dayTotal > 0 ? Math.round((dayPassed / dayTotal) * 100) : 0);
      }

      return successResponse(reply, {
        totalTestRuns: testRuns,
        totalTestCases,
        totalTestsExecuted: totalExecuted,
        averagePassRate,
        activeProjects: totalProjects,
        topFailures,
        trend: {
          dates: trendDates,
          passRates: trendPassRates,
        },
      }, undefined);
    } catch (error) {
      logger.error('Error getting summary report:', error);
      return errorResponses.internal(reply);
    }
  });

  // Get detailed test run report
  fastify.get('/test-run/:id', {
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
          results: {
            include: {
              testCase: {
                select: {
                  priority: true,
                },
              },
            },
          },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const total = testRun.results.length;
      const passed = testRun.results.filter(r => r.status === 'passed').length;
      const failed = testRun.results.filter(r => r.status === 'failed').length;
      const skipped = testRun.results.filter(r => r.status === 'skipped').length;
      const blocked = testRun.results.filter(r => r.status === 'blocked').length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      // Group by priority
      const byPriority: Record<string, { total: number; passed: number; failed: number }> = {
        critical: { total: 0, passed: 0, failed: 0 },
        high: { total: 0, passed: 0, failed: 0 },
        medium: { total: 0, passed: 0, failed: 0 },
        low: { total: 0, passed: 0, failed: 0 },
      };

      testRun.results.forEach(r => {
        const priority = r.testCase.priority || 'medium';
        if (byPriority[priority]) {
          byPriority[priority].total++;
          if (r.status === 'passed') byPriority[priority].passed++;
          if (r.status === 'failed') byPriority[priority].failed++;
        }
      });

      // Calculate duration
      const durationMinutes =
        testRun.startedAt && testRun.completedAt
          ? Math.round((testRun.completedAt.getTime() - testRun.startedAt.getTime()) / 60000)
          : null;

      return successResponse(reply, {
        testRun: {
          id: testRun.id,
          name: testRun.name,
          createdAt: testRun.createdAt,
        },
        summary: {
          total,
          passed,
          failed,
          skipped,
          blocked,
          passRate,
          durationMinutes,
        },
        byPriority,
        results: testRun.results.map(r => ({
          id: r.id,
          testCaseId: r.testCaseId,
          status: r.status,
          priority: r.testCase.priority,
          executedAt: r.executedAt,
        })),
      }, undefined);
    } catch (error) {
      logger.error('Error getting test run report:', error);
      return errorResponses.internal(reply);
    }
  });

  // Export report (simplified - returns summary for now)
  fastify.get('/export/:type', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { type } = request.params;
      const { testRunId } = request.query as any;
      const organizationId = request.organizationId;

      if (!testRunId) {
        return errorResponses.validation(reply, [
          { field: 'testRunId', message: 'testRunId is required' },
        ]);
      }

      // Get test run details
      const testRun = await prisma.testRun.findFirst({
        where: {
          id: testRunId,
          project: { organizationId },
        },
        include: {
          results: {
            include: {
              testCase: true,
              executedBy: true,
            },
          },
        },
      });

      if (!testRun) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      // For now, return JSON data - in production, you'd generate PDF/CSV/etc.
      const reportData = {
        testRun: {
          id: testRun.id,
          name: testRun.name,
          description: testRun.description,
          createdAt: testRun.createdAt,
          startedAt: testRun.startedAt,
          completedAt: testRun.completedAt,
          environment: testRun.environment,
        },
        summary: {
          total: testRun.results.length,
          passed: testRun.passedCount,
          failed: testRun.failedCount,
          skipped: testRun.skippedCount,
          blocked: testRun.blockedCount,
        },
        results: testRun.results.map(r => ({
          testCase: r.testCase.title,
          status: r.status,
          comment: r.comment,
          executedBy: r.executedBy?.firstName + ' ' + r.executedBy?.lastName,
          executedAt: r.executedAt,
        })),
      };

      // Set appropriate content type based on export type
      if (type === 'json') {
        reply.type('application/json');
        return reply.send(reportData);
      } else if (type === 'csv') {
        // Generate CSV
        const csv = [
          ['Test Case', 'Status', 'Comment', 'Executed By', 'Executed At'],
          ...testRun.results.map(r => [
            r.testCase.title,
            r.status,
            r.comment || '',
            r.executedBy?.firstName + ' ' + r.executedBy?.lastName || '',
            r.executedAt?.toISOString() || '',
          ]),
        ]
          .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
          .join('\n');

        reply.type('text/csv');
        reply.header('Content-Disposition', `attachment; filename="test-run-${testRunId}.csv"`);
        return reply.send(csv);
      } else {
        return errorResponses.validation(reply, [
          { field: 'type', message: 'Unsupported export type. Use json or csv' },
        ]);
      }
    } catch (error) {
      logger.error('Error exporting report:', error);
      return errorResponses.internal(reply);
    }
  });
}
