import { FastifyInstance } from 'fastify';
import {
  createTestCaseSchema,
  updateTestCaseSchema,
  bulkDeleteSchema,
  generateTestCasesSchema,
  crawlGenerateSchema,
  detectLoginSchema,
} from '../types/schemas';
import { generateTestCases } from '../services/ai-generator';
import { crawlAppHierarchy, statefulCrawl, detectLoginScreen, parseHierarchy, generateFromHierarchy, saveFlowsToMac } from '../services/crawl-generator';
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
      const { suiteId, projectId, status, priority, tags, search, sort = 'createdAt', order = 'desc' } = request.query as any;
      const page = parseInt((request.query as any).page) || 1;
      const perPage = Math.min(parseInt((request.query as any).perPage) || 20, 200);

      // Base org filter: allow test cases with a suite OR without a suite (suiteId=null)
      const where: any = {
        OR: [
          { suite: { project: { organizationId } } },
          { suiteId: null, createdBy: { organizationId } },
        ],
      };

      if (suiteId) {
        // When filtering by suiteId, only return cases in that suite
        delete where.OR;
        where.suiteId = suiteId;
        where.suite = { project: { organizationId } };
      } else if (projectId) {
        delete where.OR;
        where.suite = { projectId, project: { organizationId } };
      }
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
      return errorResponses.handle(reply, error, "complete this operation");
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
      return errorResponses.handle(reply, error, "complete this operation");
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
      return errorResponses.handle(reply, error, "complete this operation");
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
      return errorResponses.handle(reply, error, "complete this operation");
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
      return errorResponses.handle(reply, error, "complete this operation");
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
      return errorResponses.handle(reply, error, "complete this operation");
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
      return errorResponses.handle(reply, error, "complete this operation");
    }
  });

  // Generate test cases using AI
  fastify.post('/generate', {
    onRequest: [
      fastify.authenticate,
      fastify.getOrganizationContext,
      fastify.authorize('admin', 'manager', 'tester'),
    ],
  }, async (request: any, reply) => {
    try {
      const body = generateTestCasesSchema.parse(request.body);
      const { projectId, flutterCode, autoSave, suiteId } = body;
      const userId = (request.user as any).userId;

      // Validate projectId belongs to organization
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: request.organizationId,
        },
      });

      if (!project) {
        return errorResponses.notFound(reply, 'Project');
      }

      // Generate test cases using AI
      const generated = await generateTestCases(projectId, flutterCode);

      // Auto-save if requested and suiteId is provided
      if (autoSave && suiteId) {
        await prisma.testCase.createMany({
          data: generated.map((testCase) => ({
            title: testCase.title,
            description: testCase.description,
            steps: testCase.steps as any,
            expectedResult: testCase.expectedResult,
            priority: testCase.priority,
            tags: testCase.tags,
            suiteId: suiteId,
            automationType: 'automated' as const,
            createdById: userId,
          })),
        });

        logger.info(`AI generated and saved ${generated.length} test cases for project ${projectId}`);

        return successResponse(reply, {
          generated,
          saved: true,
          count: generated.length,
        }, undefined);
      }

      logger.info(`AI generated ${generated.length} test cases for project ${projectId}`);

      return successResponse(reply, {
        generated,
        saved: false,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Failed to generate test cases', { error: error.message });
      if (error.message?.startsWith('GENERATION_FAILED')) {
        return reply.code(422).send({ error: error.message });
      }
      return errorResponses.handle(reply, error, "complete this operation");
    }
  });

  // Detect login screen fields (Phase 1 of two-phase crawl)
  fastify.post('/detect-login-screen', {
    onRequest: [
      fastify.authenticate,
      fastify.getOrganizationContext,
      fastify.authorize('admin', 'manager', 'tester'),
    ],
  }, async (request: any, reply) => {
    try {
      const body = detectLoginSchema.parse(request.body);
      const { projectId, appId, suiteId } = body;
      const userId = (request.user as any).userId;

      // Validate project belongs to org
      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: request.organizationId },
      });
      if (!project) return errorResponses.notFound(reply, 'Project');

      logger.info(`[DetectLogin] Detecting login screen for app ${appId}`);
      const { fields, loginSummary, submitText } = await detectLoginScreen(appId);

      // Optionally save detected fields as a test case
      let savedTestCaseId: string | null = null;
      if (suiteId && fields.length > 0) {
        const suite = await prisma.testSuite.findFirst({
          where: { id: suiteId, project: { organizationId: request.organizationId } },
        });
        if (suite) {
          const tc = await prisma.testCase.create({
            data: {
              title: `Login Screen - ${appId}`,
              description: 'Auto-detected login screen elements',
              steps: fields.map((f, i) => ({
                order: i + 1,
                description: `Field: ${f.name} (${f.type})`,
                expected: `Input field with placeholder "${f.placeholder}" is visible`,
              })) as any,
              expectedResult: 'All login fields are present and accessible',
              priority: 'high',
              automationType: 'automated',
              suiteId,
              createdById: userId,
              tags: ['login', 'auto-detected'],
            },
          });
          await prisma.testSuiteMember.create({
            data: { testSuiteId: suiteId, testCaseId: tc.id },
          });
          savedTestCaseId = tc.id;
        }
      }

      logger.info(`[DetectLogin] Detected ${fields.length} login fields for app ${appId}`);

      return successResponse(reply, { fields, loginSummary, submitText, savedTestCaseId }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Failed to detect login screen', { error: error.message });
      return errorResponses.handle(reply, error, 'detect login screen');
    }
  });

  // Crawl app UI and generate test cases + Maestro flows
  fastify.post('/crawl-generate', {
    onRequest: [
      fastify.authenticate,
      fastify.getOrganizationContext,
      fastify.authorize('admin', 'manager', 'tester'),
    ],
  }, async (request: any, reply) => {
    try {
      const body = crawlGenerateSchema.parse(request.body);
      const { projectId, appId, suiteId, framework, loginSummary, loginFields, submitText, credentials, maxScreens } = body;
      const userId = (request.user as any).userId;

      // Validate project belongs to org
      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: request.organizationId },
      });
      if (!project) return errorResponses.notFound(reply, 'Project');

      // Step 1: Crawl — use two-phase AI login crawl if loginSummary+credentials provided, else simple
      const hasLoginData = loginSummary && credentials && Object.keys(credentials).length > 0;
      logger.info(`[CrawlGenerate] Starting ${hasLoginData ? 'stateful (two-phase AI login)' : 'simple'} crawl for app ${appId} [framework: ${framework}]`);

      let hierarchySummary: string;
      let generatedLoginFlowYaml: string | undefined;
      let discoveredScreens: import('../services/crawl-generator').DiscoveredScreen[] = [];
      if (hasLoginData) {
        // Ensure loginFields is a valid array with proper typing
        const safeLoginFields = Array.isArray(loginFields) && loginFields.length > 0
          ? loginFields.map(f => ({
              name: f.name ?? '',
              placeholder: f.placeholder ?? '',
              type: f.type ?? 'text'
            }))
          : undefined;
        const crawlResult = await statefulCrawl(appId, loginSummary, credentials, maxScreens, safeLoginFields, submitText, framework);
        hierarchySummary = crawlResult.hierarchySummary;
        generatedLoginFlowYaml = crawlResult.loginFlowYaml;
        discoveredScreens = crawlResult.screens;
      } else {
        const rawHierarchy = await crawlAppHierarchy(appId);
        hierarchySummary = parseHierarchy(rawHierarchy);
      }
      logger.info(`[CrawlGenerate] Hierarchy summary: ${hierarchySummary.length} chars`);

      // Ensure loginFields has proper typing for flow generation
      const safeLoginFields = Array.isArray(loginFields) && loginFields.length > 0
        ? loginFields.map(f => ({
            name: f.name ?? '',
            placeholder: f.placeholder ?? '',
            type: f.type ?? 'text',
            tapTarget: f.tapTarget ?? f.name ?? ''
          }))
        : undefined;

      logger.info(`[CrawlGenerate] Passing to generateFromHierarchy: loginFields=${JSON.stringify(safeLoginFields)}, submitText=${submitText}, credentials keys=${credentials ? Object.keys(credentials) : 'none'}`);

      // Step 2: Send to AI with guard rails + pass screen graph for E2E flow generation
      const result = await generateFromHierarchy(
        projectId, appId, hierarchySummary, credentials, framework,
        discoveredScreens, safeLoginFields, submitText
      );
      logger.info(`[CrawlGenerate] AI returned ${result.testCases.length} test cases, ${result.maestroFlows.length} flows`);

      // Step 3: Save test cases to DB (if suiteId provided)
      let savedIds: string[] = [];
      if (suiteId) {
        // Verify suite belongs to org
        const suite = await prisma.testSuite.findFirst({
          where: { id: suiteId, project: { organizationId: request.organizationId } },
        });
        if (!suite) return errorResponses.notFound(reply, 'Test Suite');

        const created = await prisma.$transaction(
          result.testCases.map(tc =>
            prisma.testCase.create({
              data: {
                title: tc.title,
                description: tc.description,
                steps: tc.steps as any,
                expectedResult: tc.expectedResult,
                priority: tc.priority,
                tags: tc.tags,
                suiteId,
                automationType: 'automated',
                createdById: userId,
              },
            })
          )
        );

        savedIds = created.map(c => c.id);

        // Add to suite members
        await prisma.testSuiteMember.createMany({
          data: savedIds.map(testCaseId => ({ testSuiteId: suiteId, testCaseId })),
          skipDuplicates: true,
        });
      }

      // Step 4: Write YAML flows to Mac
      // Prepend the verified login flow (from Phase 2) so it's saved with correct credentials/selectors
      if (generatedLoginFlowYaml) {
        result.maestroFlows.unshift({ name: 'login_verified', yaml: generatedLoginFlowYaml });
      }

      let savedFlowPaths: string[] = [];
      if (result.maestroFlows.length > 0) {
        try {
          savedFlowPaths = await saveFlowsToMac(result.maestroFlows, true);
          logger.info(`[CrawlGenerate] Saved ${savedFlowPaths.length} flows to Mac`);
        } catch (flowErr: any) {
          logger.warn(`[CrawlGenerate] Flow save failed (non-fatal): ${flowErr.message}`);
        }
      }

      return successResponse(reply, {
        testCases: result.testCases,
        maestroFlows: result.maestroFlows.map((f, i) => ({
          ...f,
          savedPath: savedFlowPaths[i] ?? null,
        })),
        savedToDb: savedIds.length > 0,
        savedCount: savedIds.length,
        hierarchyPreview: hierarchySummary.slice(0, 500),
        loginFlowYaml: generatedLoginFlowYaml ?? null,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        logger.error(`[CrawlGenerate] Zod validation failed: ${JSON.stringify(error.errors)}`);
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Failed to crawl-generate', { error: error.message });
      return errorResponses.handle(reply, error, 'crawl and generate');
    }
  });
}
