import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { successResponse, errorResponses } from '../utils/response';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// Default Standard Flutter profile pre-seeded on first run
export const STANDARD_FLUTTER_PROFILE = {
  name: 'Standard Flutter',
  description: 'Default rules for standard Flutter apps',
  buttonRules: [],
  inputRules: [],
  injectorRules: {
    standard_textfield: true,
    standard_buttons: true,
    gesture_detector: true,
    icon_button: true,
    fab: true,
    prop_based_button: false,
    prop_based_input: false,
    date_picker_detect: true,
    custom_bottom_sheet: false,
  },
  pickerPatterns: [
    { type: 'date', pattern: 'showDatePicker(', extractLabel: 'setState_variable' },
    { type: 'time', pattern: 'showTimePicker(', extractLabel: 'setState_variable' },
    { type: 'date', icon: 'Icons.calendar_today', extractLabel: 'sibling_text' },
    { type: 'date', icon: 'Icons.calendar_month', extractLabel: 'sibling_text' },
    { type: 'time', icon: 'Icons.access_time', extractLabel: 'sibling_text' },
  ],
  finderOverrides: [],
  isDefault: true,
};

export default async function appProfileRoutes(fastify: FastifyInstance) {
  // GET /app-profiles — list all profiles
  fastify.get('/app-profiles', { onRequest: [fastify.authenticate] }, async (_req, reply) => {
    try {
      const profiles = await prisma.appProfile.findMany({ orderBy: { createdAt: 'asc' } });

      // Seed default profile if none exist
      if (profiles.length === 0) {
        const seeded = await prisma.appProfile.create({ data: STANDARD_FLUTTER_PROFILE });
        return successResponse(reply, [seeded]);
      }

      return successResponse(reply, profiles);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'list app profiles');
    }
  });

  // GET /app-profiles/:id
  fastify.get('/app-profiles/:id', { onRequest: [fastify.authenticate] }, async (request: any, reply) => {
    try {
      const profile = await prisma.appProfile.findUnique({ where: { id: request.params.id } });
      if (!profile) return errorResponses.notFound(reply, 'AppProfile');
      return successResponse(reply, profile);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'get app profile');
    }
  });

  // POST /app-profiles — create
  fastify.post('/app-profiles', { onRequest: [fastify.authenticate] }, async (request: any, reply) => {
    try {
      const { name, description, buttonRules, inputRules, injectorRules, pickerPatterns, finderOverrides, isDefault } = request.body as any;

      if (!name?.trim()) return errorResponses.validation(reply, [{ field: 'name', message: 'Name is required' }]);

      // Unset other defaults if this is set as default
      if (isDefault) await prisma.appProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } });

      const profile = await prisma.appProfile.create({
        data: {
          name: name.trim(),
          description: description || null,
          buttonRules: buttonRules || [],
          inputRules: inputRules || [],
          injectorRules: injectorRules || {},
          pickerPatterns: pickerPatterns || [],
          finderOverrides: finderOverrides || [],
          isDefault: isDefault || false,
        },
      });

      logger.info(`[AppProfile] Created: ${profile.name}`);
      return successResponse(reply, profile, undefined);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'create app profile');
    }
  });

  // PUT /app-profiles/:id — update
  fastify.put('/app-profiles/:id', { onRequest: [fastify.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const { name, description, buttonRules, inputRules, injectorRules, pickerPatterns, finderOverrides, isDefault } = request.body as any;

      const existing = await prisma.appProfile.findUnique({ where: { id } });
      if (!existing) return errorResponses.notFound(reply, 'AppProfile');

      if (isDefault) await prisma.appProfile.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });

      const profile = await prisma.appProfile.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description }),
          ...(buttonRules !== undefined && { buttonRules }),
          ...(inputRules !== undefined && { inputRules }),
          ...(injectorRules !== undefined && { injectorRules }),
          ...(pickerPatterns !== undefined && { pickerPatterns }),
          ...(finderOverrides !== undefined && { finderOverrides }),
          ...(isDefault !== undefined && { isDefault }),
        },
      });

      logger.info(`[AppProfile] Updated: ${profile.name}`);
      return successResponse(reply, profile, undefined);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'update app profile');
    }
  });

  // DELETE /app-profiles/:id
  fastify.delete('/app-profiles/:id', { onRequest: [fastify.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const existing = await prisma.appProfile.findUnique({ where: { id } });
      if (!existing) return errorResponses.notFound(reply, 'AppProfile');
      if (existing.isDefault) return errorResponses.validation(reply, [{ field: 'id', message: 'Cannot delete the default profile' }]);

      // Unlink runners using this profile
      await prisma.runner.updateMany({ where: { defaultProfileId: id }, data: { defaultProfileId: null } });
      await prisma.appProfile.delete({ where: { id } });

      logger.info(`[AppProfile] Deleted: ${existing.name}`);
      return successResponse(reply, null, undefined);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'delete app profile');
    }
  });

  // PATCH /app-profiles/:id/set-runner-default — link profile to a runner as its default
  fastify.patch('/app-profiles/:id/set-runner-default', { onRequest: [fastify.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const { runnerId } = request.body as { runnerId: string };

      const profile = await prisma.appProfile.findUnique({ where: { id } });
      if (!profile) return errorResponses.notFound(reply, 'AppProfile');

      await prisma.runner.update({ where: { id: runnerId }, data: { defaultProfileId: id } });
      return successResponse(reply, null, undefined);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'set runner default profile');
    }
  });

  // GET /app-profiles/for-runner/:runnerId — get effective profile for a runner
  fastify.get('/app-profiles/for-runner/:runnerId', { onRequest: [fastify.authenticate] }, async (request: any, reply) => {
    try {
      const runner = await prisma.runner.findUnique({
        where: { id: request.params.runnerId },
        include: { defaultProfile: true },
      });
      if (!runner) return errorResponses.notFound(reply, 'Runner');

      const profile = runner.defaultProfile
        || await prisma.appProfile.findFirst({ where: { isDefault: true } })
        || await prisma.appProfile.findFirst({ orderBy: { createdAt: 'asc' } });

      return successResponse(reply, profile);
    } catch (err: any) {
      return errorResponses.handle(reply, err, 'get runner profile');
    }
  });
}
