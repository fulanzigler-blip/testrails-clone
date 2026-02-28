import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp } from '../helpers/api';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createTestUser, createTestOrganization, createTestIntegration, createTestNotification } from '../helpers/test-data';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

describe('Integration & Notification Endpoints', () => {
  let app: any;
  let accessToken: string;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean up database
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.integration.deleteMany();
    await prisma.notification.deleteMany();
    await redis.flushdb();

    // Create test organization and user
    const org = await createTestOrganization();
    orgId = org.id;
    const user = await createTestUser(org.id);
    userId = user.id;

    // Generate access token
    accessToken = app.jwt.sign(
      { userId: user.id, type: 'access' },
      { expiresIn: '15m' }
    );
  });

  describe('Integration Endpoints', () => {
    describe('POST /api/v1/integrations', () => {
      it('should create a new integration', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            type: 'slack',
            name: 'Slack Integration',
            config: {
              webhookUrl: 'https://hooks.slack.com/services/xxx/yyy/zzz',
              channel: '#test-notifications',
            },
            enabled: true,
          },
        });

        expect(response.statusCode).toBe(201);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.type).toBe('slack');
        expect(result.data.name).toBe('Slack Integration');
      });

      it('should not create integration with invalid type', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            type: 'invalid-type',
            name: 'Invalid Integration',
            config: {},
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /api/v1/integrations', () => {
      beforeEach(async () => {
        await createTestIntegration(orgId, { type: 'slack', name: 'Slack' });
        await createTestIntegration(orgId, { type: 'jira', name: 'Jira' });
      });

      it('should get all integrations', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('integrations');
        expect(result.data.integrations.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('GET /api/v1/integrations/:id', () => {
      let integrationId: string;

      beforeEach(async () => {
        const integration = await createTestIntegration(orgId);
        integrationId = integration.id;
      });

      it('should get integration by id', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/integrations/${integrationId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.id).toBe(integrationId);
      });
    });

    describe('PATCH /api/v1/integrations/:id', () => {
      let integrationId: string;

      beforeEach(async () => {
        const integration = await createTestIntegration(orgId);
        integrationId = integration.id;
      });

      it('should update integration', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/integrations/${integrationId}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          payload: {
            name: 'Updated Integration Name',
            enabled: false,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('Updated Integration Name');
        expect(result.data.enabled).toBe(false);
      });
    });

    describe('DELETE /api/v1/integrations/:id', () => {
      it('should delete integration', async () => {
        const integration = await createTestIntegration(orgId);

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/v1/integrations/${integration.id}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(204);

        // Verify integration is deleted
        const deletedIntegration = await prisma.integration.findUnique({
          where: { id: integration.id },
        });
        expect(deletedIntegration).toBeNull();
      });
    });
  });

  describe('Notification Endpoints', () => {
    describe('GET /api/v1/notifications', () => {
      beforeEach(async () => {
        await createTestNotification(userId, { type: 'test_run_completed' });
        await createTestNotification(userId, { type: 'bug_created' });
      });

      it('should get all notifications', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('notifications');
        expect(result.data.notifications.length).toBeGreaterThanOrEqual(2);
      });

      it('should filter by unread status', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/notifications?unread=true',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        // All notifications should be unread (readAt is null)
        result.data.notifications.forEach((notif: any) => {
          expect(notif.readAt).toBeNull();
        });
      });
    });

    describe('PATCH /api/v1/notifications/:id/read', () => {
      let notificationId: string;

      beforeEach(async () => {
        const notification = await createTestNotification(userId);
        notificationId = notification.id;
      });

      it('should mark notification as read', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/notifications/${notificationId}/read`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);
        expect(result.data.readAt).not.toBeNull();
      });
    });

    describe('PATCH /api/v1/notifications/read-all', () => {
      beforeEach(async () => {
        await createTestNotification(userId, { type: 'test_run_completed' });
        await createTestNotification(userId, { type: 'bug_created' });
      });

      it('should mark all notifications as read', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/v1/notifications/read-all',
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const result = JSON.parse(response.payload);
        expect(result.success).toBe(true);

        // Verify all notifications are marked as read
        const notifications = await prisma.notification.findMany({
          where: { userId },
        });
        notifications.forEach((notif) => {
          expect(notif.readAt).not.toBeNull();
        });
      });
    });

    describe('DELETE /api/v1/notifications/:id', () => {
      it('should delete notification', async () => {
        const notification = await createTestNotification(userId);

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/v1/notifications/${notification.id}`,
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        expect(response.statusCode).toBe(204);

        // Verify notification is deleted
        const deletedNotification = await prisma.notification.findUnique({
          where: { id: notification.id },
        });
        expect(deletedNotification).toBeNull();
      });
    });
  });
});
