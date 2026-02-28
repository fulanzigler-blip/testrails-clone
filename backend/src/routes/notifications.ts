import { FastifyInstance } from 'fastify';
import prisma from '../config/database';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Get user notifications
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const userId = (request.user as any).userId;
      const { unreadOnly = 'false', page = 1, perPage = 20 } = request.query as any;

      const where: any = { userId };
      if (unreadOnly === 'true') {
        where.readAt = null;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, readAt: null } }),
      ]);

      const mappedNotifications = notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        readAt: n.readAt,
        createdAt: n.createdAt,
      }));

      return successResponse(reply, mappedNotifications, {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
        unreadCount,
      });
    } catch (error) {
      logger.error('Error getting notifications:', error);
      return errorResponses.internal(reply);
    }
  });

  // Mark notification as read
  fastify.put('/:id/read', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const userId = (request.user as any).userId;

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
      });

      if (!notification) {
        return errorResponses.notFound(reply, 'Notification');
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });

      return successResponse(reply, {
        id: updated.id,
        readAt: updated.readAt,
      }, undefined);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      return errorResponses.internal(reply);
    }
  });

  // Mark all notifications as read
  fastify.put('/read-all', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const userId = (request.user as any).userId;

      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      return errorResponses.internal(reply);
    }
  });

  // Delete notification
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const userId = (request.user as any).userId;

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
      });

      if (!notification) {
        return errorResponses.notFound(reply, 'Notification');
      }

      await prisma.notification.delete({
        where: { id },
      });

      return reply.code(204).send();
    } catch (error) {
      logger.error('Error deleting notification:', error);
      return errorResponses.internal(reply);
    }
  });
}
