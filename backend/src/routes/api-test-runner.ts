import { FastifyInstance } from 'fastify';
import { successResponse, errorResponses } from '../utils/response';
import logger from '../utils/logger';
import prisma from '../config/database';
import {
  executeAPITest,
  generateAPITestFromEndpoints,
  saveAPITestResult,
  generateFlutterAPITestCode,
  type APITestSuite,
} from '../utils/api-test-runner';

// ─── API Test Runner Routes ───────────────────────────────────────────────────────

export default async function apiTestRunnerRoutes(fastify: FastifyInstance) {
  // POST /api/v1/api-test-runner/generate - Generate test from endpoints
  fastify.post('/generate', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { projectId, endpoints, mode = 'mock', environment } = request.body;

      logger.info(`[APITestRunner] Generating test for project: ${projectId}`);

      const test = await generateAPITestFromEndpoints(projectId, endpoints, mode);

      return successResponse(reply, test, undefined);
    } catch (error: any) {
      logger.error('[APITestRunner] Generate failed:', error);
      return errorResponses.handle(reply, error, 'generate API test');
    }
  });

  // POST /api/v1/api-test-runner/execute - Execute API test
  fastify.post('/execute', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { test, testRunId } = request.body;

      logger.info(`[APITestRunner] Executing test: ${test.id}`);

      const result = await executeAPITest(test, async (stepIndex, stepResult) => {
        // Send progress update via WebSocket if available
        logger.debug(`[APITestRunner] Step ${stepIndex}: ${stepResult.status}`);
      });

      // Save results
      if (testRunId) {
        await saveAPITestResult(test.id, result, testRunId);
      }

      return successResponse(reply, result, undefined);
    } catch (error: any) {
      logger.error('[APITestRunner] Execution failed:', error);
      return errorResponses.handle(reply, error, 'execute API test');
    }
  });

  // POST /api/v1/api-test-runner/flutter-code - Generate Flutter test code
  fastify.post('/flutter-code', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { test, appPath } = request.body;

      logger.info(`[APITestRunner] Generating Flutter test code for: ${test.id}`);

      const code = await generateFlutterAPITestCode(test, appPath);

      return successResponse(reply, { code }, undefined);
    } catch (error: any) {
      logger.error('[APITestRunner] Flutter code generation failed:', error);
      return errorResponses.handle(reply, error, 'generate Flutter test code');
    }
  });

  // GET /api/v1/api-test-runner/history/:projectId - Get test history
  fastify.get('/history/:projectId', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { projectId } = request.params;

      // Fetch test runs related to API tests
      const testRuns = await prisma.testRun.findMany({
        where: {
          projectId,
          // Add filter for API tests if needed
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return successResponse(reply, {
        testRuns,
        total: testRuns.length,
      }, undefined);
    } catch (error: any) {
      logger.error('[APITestRunner] Fetch history failed:', error);
      return errorResponses.handle(reply, error, 'fetch test history');
    }
  });

  // POST /api/v1/api-test-runner/validate - Validate test configuration
  fastify.post('/validate', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { test } = request.body;

      // Validate test structure
      const errors: string[] = [];

      if (!test.id) {
        errors.push('Test ID is required');
      }
      if (!test.name) {
        errors.push('Test name is required');
      }
      if (!test.mode || !['mock', 'real'].includes(test.mode)) {
        errors.push('Valid mode (mock/real) is required');
      }
      if (!test.steps || test.steps.length === 0) {
        errors.push('At least one test step is required');
      }

      for (let i = 0; i < (test.steps || []).length; i++) {
        const step = test.steps[i];
        if (!step.id) {
          errors.push(`Step ${i}: ID is required`);
        }
        if (!step.type) {
          errors.push(`Step ${i}: Type is required`);
        }
        if (!step.config?.endpoint) {
          errors.push(`Step ${i}: Endpoint config is required`);
        }
      }

      return successResponse(reply, {
        valid: errors.length === 0,
        errors,
      }, undefined);
    } catch (error: any) {
      logger.error('[APITestRunner] Validation failed:', error);
      return errorResponses.handle(reply, error, 'validate test configuration');
    }
  });
}
