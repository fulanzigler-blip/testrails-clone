import { FastifyInstance } from 'fastify';
import { createProjectSchema, updateProjectSchema } from '../types/schemas';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function projectRoutes(fastify: FastifyInstance) {
  // List projects
  fastify.get('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const organizationId = request.organizationId;
      const { page = 1, perPage = 20, search } = request.query as any;

      const where: any = { organizationId };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          include: {
            _count: {
              select: {
                testSuites: true,
                testRuns: true,
              },
            },
          },
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.project.count({ where }),
      ]);

      const mappedProjects = projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt,
        testSuitesCount: p._count.testSuites,
        testRunsCount: p._count.testRuns,
      }));

      return successResponse(reply, mappedProjects, {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      });
    } catch (error) {
      logger.error('Error listing projects:', error);
      return errorResponses.internal(reply);
    }
  });

  // Create project
  fastify.post('/', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const input = createProjectSchema.parse(request.body);
      const organizationId = request.organizationId;

      const project = await prisma.project.create({
        data: {
          ...input,
          organizationId,
        },
      });

      logger.info(`Project created: ${project.id}`);

      return successResponse(reply, {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error creating project:', error);
      return errorResponses.internal(reply);
    }
  });

  // Get project details
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const project = await prisma.project.findFirst({
        where: { id, organizationId },
        include: {
          testSuites: {
            select: {
              id: true,
              name: true,
              _count: {
                select: { members: true },
              },
            },
          },
        },
      });

      if (!project) {
        return errorResponses.notFound(reply, 'Project');
      }

      return successResponse(reply, {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        testSuites: project.testSuites.map(ts => ({
          id: ts.id,
          name: ts.name,
          testCasesCount: ts._count.members,
        })),
      }, undefined);
    } catch (error) {
      logger.error('Error getting project:', error);
      return errorResponses.internal(reply);
    }
  });

  // Update project
  fastify.put('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const input = updateProjectSchema.parse(request.body);
      const organizationId = request.organizationId;

      const project = await prisma.project.findFirst({
        where: { id, organizationId },
      });

      if (!project) {
        return errorResponses.notFound(reply, 'Project');
      }

      const updatedProject = await prisma.project.update({
        where: { id },
        data: input,
      });

      return successResponse(reply, {
        id: updatedProject.id,
        name: updatedProject.name,
        description: updatedProject.description,
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error updating project:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete project
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin')],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const organizationId = request.organizationId;

      const project = await prisma.project.findFirst({
        where: { id, organizationId },
      });

      if (!project) {
        return errorResponses.notFound(reply, 'Project');
      }

      await prisma.project.delete({
        where: { id },
      });

      logger.info(`Project deleted: ${id}`);

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting project:', error);
      return errorResponses.internal(reply);
    }
  });
}
