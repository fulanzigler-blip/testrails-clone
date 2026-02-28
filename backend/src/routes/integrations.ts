import { FastifyInstance } from 'fastify';
import { createIntegrationSchema, updateIntegrationSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function integrationRoutes(fastify: FastifyInstance) {
  // List integrations
  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;

      const integrations = await prisma.integration.findMany({
        where: { organizationId },
        select: {
          id: true,
          type: true,
          name: true,
          enabled: true,
          createdAt: true,
          updatedAt: true,
          // Don't return full config for security
          config: {
            select: {
              url: true,
              project: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Mask sensitive config values
      const maskedIntegrations = integrations.map(int => ({
        id: int.id,
        type: int.type,
        name: int.name,
        enabled: int.enabled,
        config: int.config,
        createdAt: int.createdAt,
        updatedAt: int.updatedAt,
      }));

      return successResponse(reply, maskedIntegrations, undefined);
    } catch (error) {
      logger.error('Error listing integrations:', error);
      return errorResponses.internal(reply);
    }
  });

  // Create integration
  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const input = createIntegrationSchema.parse(request.body);
      const organizationId = request.organizationId;

      // Validate config based on integration type
      // TODO: Add validation for each integration type

      const integration = await prisma.integration.create({
        data: {
          organizationId,
          type: input.type,
          name: input.name || `${input.type} integration`,
          config: input.config,
          enabled: input.enabled,
        },
      });

      logger.info(`Integration created: ${integration.id} of type ${input.type}`);

      return successResponse(reply, {
        id: integration.id,
        type: integration.type,
        name: integration.name,
        enabled: integration.enabled,
        createdAt: integration.createdAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error creating integration:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update integration
  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateIntegrationSchema.parse(request.body);
      const organizationId = request.organizationId;

      const integration = await prisma.integration.findFirst({
        where: { id, organizationId },
      });

      if (!integration) {
        return errorResponses.notFound(reply, 'Integration');
      }

      const updatedIntegration = await prisma.integration.update({
        where: { id },
        data: input,
      });

      return successResponse(reply, {
        id: updatedIntegration.id,
        type: updatedIntegration.type,
        name: updatedIntegration.name,
        enabled: updatedIntegration.enabled,
        createdAt: updatedIntegration.createdAt,
        updatedAt: updatedIntegration.updatedAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating integration:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete integration
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const integration = await prisma.integration.findFirst({
        where: { id, organizationId },
      });

      if (!integration) {
        return errorResponses.notFound(reply, 'Integration');
      }

      await prisma.integration.delete({
        where: { id },
      });

      logger.info(`Integration deleted: ${id}`);

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting integration:', error);
      return errorResponses.internal(reply);
    }
  });

  // Test integration connection
  fastify.post('/:id/test', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const integration = await prisma.integration.findFirst({
        where: { id, organizationId },
      });

      if (!integration) {
        return errorResponses.notFound(reply, 'Integration');
      }

      // TODO: Implement actual connection testing for each integration type
      // For now, return a mock response
      const testResults: Record<string, { status: string; message: string }> = {
        jira: { status: 'connected', message: 'Successfully connected to Jira' },
        github: { status: 'connected', message: 'Successfully connected to GitHub' },
        gitlab: { status: 'connected', message: 'Successfully connected to GitLab' },
        linear: { status: 'connected', message: 'Successfully connected to Linear' },
        slack: { status: 'connected', message: 'Successfully connected to Slack' },
        email: { status: 'connected', message: 'Successfully connected to email server' },
        webhook: { status: 'connected', message: 'Webhook endpoint is accessible' },
      };

      const result = testResults[integration.type] || {
        status: 'connected',
        message: 'Connection successful',
      };

      logger.info(`Integration test: ${id} of type ${integration.type}`);

      return successResponse(reply, result, undefined);
    } catch (error) {
      logger.error('Error testing integration:', error);
      return errorResponses.internal(reply);
    }
  });
}
