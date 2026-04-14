import { FastifyInstance } from 'fastify';
import { successResponse, errorResponses } from '../utils/response';
import { validateScanAPIRequest, APIDetectionResultSchema } from '../types/api-schemas';
import logger from '../utils/logger';
import prisma from '../config/database';
import { scanProjectAPIEndpoints } from '../utils/api-detector';

// ─── API Detection Routes ─────────────────────────────────────────────────────────

export default async function apiDetectionRoutes(fastify: FastifyInstance) {
  // POST /api/v1/api-detection/scan - Scan project for API endpoints
  fastify.post('/scan', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const body = validateScanAPIRequest(request.body);
      const { projectId, projectPath, viaSSH = true } = body;

      logger.info(`[APIDetection] Scanning project: ${projectId || projectPath}`);

      // Get project path from DB if projectId provided
      let actualProjectPath = projectPath;
      if (projectId && !projectPath) {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
        });
        if (!project) {
          return errorResponses.notFound(reply, 'Project');
        }
        // For now, we'd need to get the project path from runner config
        // This is a simplified version
        actualProjectPath = project.description || '';
      }

      if (!actualProjectPath) {
        return errorResponses.validation(reply, [{ field: 'projectPath', message: 'Project path is required' }]);
      }

      // Scan for API endpoints
      const result = await scanProjectAPIEndpoints(actualProjectPath, { viaSSH });

      // Store in database if projectId provided
      if (projectId) {
        // Clear old endpoints for this project
        await prisma.apiEndpoint.deleteMany({
          where: { projectId },
        });

        // Store new endpoints
        for (const endpoint of result.apiEndpoints) {
          await prisma.apiEndpoint.create({
            data: {
              projectId,
              method: endpoint.method,
              url: endpoint.url,
              fullPath: endpoint.fullPath,
              responseType: endpoint.responseType,
              fields: JSON.stringify(endpoint.fields || []),
              screens: endpoint.usedInScreens || [],
              file: endpoint.file,
              line: endpoint.line,
            },
          });
        }

        // Update or create element catalog
        const existingCatalog = await prisma.elementCatalog.findFirst({
          where: { projectId, type: 'flutter' },
        });

        const catalogData = {
          apiEndpoints: JSON.stringify(result.apiEndpoints.map(e => ({
            method: e.method,
            url: e.url,
            responseType: e.responseType,
            fields: e.fields,
          }))),
        };

        if (existingCatalog) {
          await prisma.elementCatalog.update({
            where: { id: existingCatalog.id },
            data: {
              apiEndpoints: catalogData.apiEndpoints,
              updatedAt: new Date(),
            },
          });
        } else {
          await prisma.elementCatalog.create({
            data: {
              projectId,
              name: `${projectId || 'Unknown'} API Scan`,
              type: 'flutter',
              source: 'api-detection',
              apiEndpoints: catalogData.apiEndpoints,
              screens: result.screensWithAPI.map(screen => ({ name: screen, file: screen })),
            },
          });
        }
      }

      return successResponse(reply, result, undefined);
    } catch (error: any) {
      logger.error('[APIDetection] Scan failed:', error);
      return errorResponses.handle(reply, error, 'scan API endpoints');
    }
  });

  // GET /api/v1/api-detection/:projectId - Get detected API endpoints
  fastify.get('/:projectId', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { projectId } = request.params;

      const endpoints = await prisma.apiEndpoint.findMany({
        where: { projectId },
        orderBy: [{ method: 'asc' }, { url: 'asc' }],
      });

      // Group by screen
      const groupedByScreen: Record<string, typeof endpoints> = {};
      for (const endpoint of endpoints) {
        for (const screen of endpoint.screens || []) {
          if (!groupedByScreen[screen]) {
            groupedByScreen[screen] = [];
          }
          groupedByScreen[screen].push(endpoint);
        }
      }

      return successResponse(reply, {
        projectId,
        endpoints,
        groupedByScreen,
        totalEndpoints: endpoints.length,
        screensWithAPI: Object.keys(groupedByScreen),
      }, undefined);
    } catch (error: any) {
      logger.error('[APIDetection] Fetch failed:', error);
      return errorResponses.handle(reply, error, 'fetch API endpoints');
    }
  });

  // GET /api/v1/api-detection/:projectId/endpoints - Get all endpoints with details
  fastify.get('/:projectId/endpoints', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { projectId } = request.params;

      const endpoints = await prisma.apiEndpoint.findMany({
        where: { projectId },
        orderBy: [{ method: 'asc' }, { url: 'asc' }],
      });

      return successResponse(reply, {
        endpoints,
        total: endpoints.length,
      }, undefined);
    } catch (error: any) {
      logger.error('[APIDetection] Fetch endpoints failed:', error);
      return errorResponses.handle(reply, error, 'fetch API endpoints');
    }
  });

  // POST /api/v1/api-detection/:projectId/mock - Create mock data for endpoint
  fastify.post('/:projectId/mock', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { projectId } = request.params;
      const { endpoint, method, url, scenario, response, delay, label } = request.body;

      // Find the endpoint
      const apiEndpoint = await prisma.apiEndpoint.findFirst({
        where: {
          projectId,
          method: method.toUpperCase(),
          url,
        },
      });

      if (!apiEndpoint) {
        return errorResponses.notFound(reply, 'API Endpoint');
      }

      // Create mock
      const mock = await prisma.apiMock.create({
        data: {
          endpointId: apiEndpoint.id,
          name: label || `${method} ${url} - ${scenario}`,
          description: `Mock scenario: ${scenario}`,
          scenario,
          response: response || {},
          delay: delay || 0,
        },
      });

      return successResponse(reply, mock, undefined);
    } catch (error: any) {
      logger.error('[APIDetection] Mock creation failed:', error);
      return errorResponses.handle(reply, error, 'create mock data');
    }
  });

  // GET /api/v1/api-detection/:projectId/mocks - Get all mocks for project
  fastify.get('/:projectId/mocks', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { projectId } = request.params;

      const mocks = await prisma.apiMock.findMany({
        where: {
          endpoint: {
            projectId,
          },
          isActive: true,
        },
        include: {
          endpoint: true,
        },
        orderBy: [{ endpoint: { method: 'asc' }}, { name: 'asc' }],
      });

      return successResponse(reply, {
        mocks,
        total: mocks.length,
      }, undefined);
    } catch (error: any) {
      logger.error('[APIDetection] Fetch mocks failed:', error);
      return errorResponses.handle(reply, error, 'fetch mock data');
    }
  });
}
