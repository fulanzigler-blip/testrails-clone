import { FastifyInstance } from 'fastify';
import { updateUserSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function userRoutes(fastify: FastifyInstance) {
  // List users
  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;
      const { page = 1, perPage = 20, role, search } = request.query as any;

      const where: any = { organizationId };
      if (role) where.role = role;
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            lastLoginAt: true,
            createdAt: true,
          },
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      return successResponse(reply, users, {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (error) {
      logger.error('Error listing users:', error);
      return errorResponses.internal(reply);
    }
  });

  // Get user details
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const user = await prisma.user.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          lastLoginAt: true,
          createdAt: true,
          teams: {
            select: {
              role: true,
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      return successResponse(reply, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        lastLoginAt: user.lastLoginAt,
        teams: user.teams.map(ut => ({
          id: ut.team.id,
          name: ut.team.name,
          role: ut.role,
        })),
      }, undefined);
    } catch (error) {
      logger.error('Error getting user:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update user
  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateUserSchema.parse(request.body);
      const organizationId = request.organizationId;
      const requestUserRole = request.userRole;

      const user = await prisma.user.findFirst({
        where: { id, organizationId },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      // Only admins can change roles
      if (input.role && requestUserRole !== 'admin') {
        return errorResponses.forbidden(reply, 'Only admins can change user roles');
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: input,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      });

      return successResponse(reply, updatedUser, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating user:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete user (soft delete by deactivating - implement as needed)
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;
      const currentUserId = (request.user as any).userId;

      // Can't delete yourself
      if (id === currentUserId) {
        return errorResponses.conflict(reply, 'Cannot delete your own account');
      }

      const user = await prisma.user.findFirst({
        where: { id, organizationId },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      await prisma.user.delete({
        where: { id },
      });

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting user:', error);
      return errorResponses.internal(reply);
    }
  });
}
