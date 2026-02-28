import { FastifyInstance } from 'fastify';
import { updateOrganizationSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function organizationRoutes(fastify: FastifyInstance) {
  // Get organization details
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      // Users can only access their own organization
      if (id !== organizationId) {
        return errorResponses.forbidden(reply);
      }

      const organization = await prisma.organization.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              users: true,
              projects: true,
            },
          },
        },
      });

      if (!organization) {
        return errorResponses.notFound(reply, 'Organization');
      }

      return successResponse(reply, {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        maxUsers: organization.maxUsers,
        usersCount: organization._count.users,
        projectsCount: organization._count.projects,
        createdAt: organization.createdAt,
      }, undefined);
    } catch (error) {
      logger.error('Error getting organization:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update organization
  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateOrganizationSchema.parse(request.body);
      const organizationId = request.organizationId;

      if (id !== organizationId) {
        return errorResponses.forbidden(reply);
      }

      const organization = await prisma.organization.update({
        where: { id },
        data: input,
      });

      return successResponse(reply, {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        maxUsers: organization.maxUsers,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating organization:', error);
      return errorResponses.internal(reply);
    }
  });
}
