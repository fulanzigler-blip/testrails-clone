import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../config/database';
import { successResponse, errorResponses } from '../utils/response';
import logger from '../utils/logger';
import GitHubScenariosService, { YamlTestCase } from '../services/github-scenarios';

export default async function githubScenariosRoutes(fastify: FastifyInstance) {
  const syncBodySchema = z.object({
    projectId: z.string().uuid(),
  });

  const pushBodySchema = z.object({
    projectId: z.string().uuid(),
    suiteId: z.string().uuid().optional(),
  });

  // POST /sync — pull scenarios from GitHub and upsert into DB
  fastify.post('/sync', {
    onRequest: [
      fastify.authenticate,
      fastify.getOrganizationContext,
      fastify.authorize('admin', 'manager'),
    ],
  }, async (request: any, reply) => {
    try {
      const input = syncBodySchema.parse(request.body);

      const integration = await prisma.integration.findFirst({
        where: {
          type: 'github_scenarios',
          organizationId: request.organizationId,
        },
      });

      if (!integration) {
        return errorResponses.notFound(reply, 'GitHub Scenarios integration not configured');
      }

      const config = integration.config as any;
      const { token, owner, repo } = config;

      const service = new GitHubScenariosService(token, owner, repo);
      const scenarios = await service.pullScenarios();

      let created = 0;
      let updated = 0;

      for (const scenario of scenarios) {
        const existingTestCase = await prisma.testCase.findFirst({
          where: {
            title: scenario.title,
            suite: {
              projectId: input.projectId,
            },
          },
        });

        if (existingTestCase) {
          await prisma.testCase.update({
            where: { id: existingTestCase.id },
            data: {
              description: scenario.description,
              steps: scenario.steps as any,
              expectedResult: scenario.expectedResult,
              priority: scenario.priority as any,
              tags: scenario.tags,
            },
          });
          updated++;
        } else {
          await prisma.testCase.create({
            data: {
              title: scenario.title,
              description: scenario.description,
              steps: scenario.steps as any,
              expectedResult: scenario.expectedResult,
              priority: scenario.priority as any,
              tags: scenario.tags,
              suiteId: null,
              createdById: request.user.userId,
            },
          });
          created++;
        }
      }

      return successResponse(reply, { synced: scenarios.length, created, updated }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error syncing GitHub scenarios:', error);
      return errorResponses.internal(reply);
    }
  });

  // POST /push — export test cases to GitHub as YAML
  fastify.post('/push', {
    onRequest: [
      fastify.authenticate,
      fastify.getOrganizationContext,
      fastify.authorize('admin', 'manager'),
    ],
  }, async (request: any, reply) => {
    try {
      const input = pushBodySchema.parse(request.body);

      const integration = await prisma.integration.findFirst({
        where: {
          type: 'github_scenarios',
          organizationId: request.organizationId,
        },
      });

      if (!integration) {
        return errorResponses.notFound(reply, 'GitHub Scenarios integration not configured');
      }

      const config = integration.config as any;
      const { token, owner, repo } = config;

      const whereClause = input.suiteId
        ? { suiteId: input.suiteId }
        : { suite: { projectId: input.projectId } };

      const testCases = await prisma.testCase.findMany({
        where: whereClause,
      });

      const yamlCases: YamlTestCase[] = testCases.map((tc) => ({
        id: tc.id,
        title: tc.title,
        description: tc.description || '',
        steps: Array.isArray(tc.steps) ? (tc.steps as any[]) : [],
        expectedResult: tc.expectedResult || '',
        priority: tc.priority,
        tags: tc.tags,
      }));

      const service = new GitHubScenariosService(token, owner, repo);
      const commitUrl = await service.pushScenarios(
        yamlCases,
        'Update test scenarios from TestRails'
      );

      return successResponse(reply, { exported: yamlCases.length, commitUrl }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error pushing GitHub scenarios:', error);
      return errorResponses.internal(reply);
    }
  });
}
