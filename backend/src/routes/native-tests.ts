import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponses } from '../utils/response';
import logger from '../utils/logger';
import prisma from '../config/database';
import { getMobileDriver, MobileRunnerConfig, NativeStep } from '../utils/mobile-driver';

// ─── Schemas ───────────────────────────────────────────────────────────────────

const nativeStepSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['tap', 'enter_text', 'assert_visible', 'assert_not_visible', 'assert_text', 'wait', 'screenshot', 'press_key', 'scroll']),
  elementId: z.string().optional(),
  finderStrategy: z.enum(['resource-id', 'content-desc', 'text', 'bounds']).optional(),
  finderValue: z.string().optional(),
  fallbackFinders: z.array(z.object({
    strategy: z.enum(['resource-id', 'content-desc', 'text', 'bounds']),
    value: z.string(),
  })).optional(),
  value: z.string().optional(),
  text: z.string().optional(),
});

const runSchema = z.object({
  platform: z.enum(['android', 'ios']).default('android'),
  runnerId: z.string().optional(),
  appId: z.string().optional(),
  steps: z.array(nativeStepSchema).min(1),
});

const scanSchema = z.object({
  platform: z.enum(['android', 'ios']).default('android'),
  runnerId: z.string().optional(),
  appId: z.string().optional(),       // when set, the app is launched before scanning
  launch: z.boolean().default(true),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function resolveRunner(runnerId?: string): Promise<MobileRunnerConfig & { name: string }> {
  let runner: any = null;
  if (runnerId) runner = await prisma.runner.findUnique({ where: { id: runnerId } });
  if (!runner) runner = await prisma.runner.findFirst({ where: { isDefault: true } });
  if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!runner) throw new Error('No runner configured — add a runner with a connected device first');
  return {
    name: runner.name,
    host: runner.host,
    username: runner.username,
    sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
    deviceId: runner.deviceId || '',
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────────
//
// Black-box native mobile testing (Android now, iOS later) — no app source code
// needed, works on whatever app is installed on the runner's device.

export default async function nativeTestRoutes(fastify: FastifyInstance) {

  // GET /apps — installed 3rd-party packages on the device (app picker)
  fastify.get('/apps', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { runnerId, platform } = request.query as { runnerId?: string; platform?: string };
      const driver = getMobileDriver((platform as any) || 'android');
      const runner = await resolveRunner(runnerId);
      const apps = await driver.listApps(runner);
      logger.info(`[NativeTest] Listed ${apps.length} apps on ${runner.name}`);
      return successResponse(reply, { apps }, undefined);
    } catch (error: any) {
      logger.error('[NativeTest] List apps failed:', error);
      return errorResponses.handle(reply, error, 'list installed apps');
    }
  });

  // POST /scan — capture current screen (optionally launching the app first) and
  // return an element catalog in the same shape the Visual Test Builder expects
  fastify.post('/scan', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const body = scanSchema.parse(request.body);
      const driver = getMobileDriver(body.platform);
      const runner = await resolveRunner(body.runnerId);

      if (body.appId && body.launch) {
        logger.info(`[NativeTest] Launching ${body.appId} on ${runner.name}`);
        await driver.launchApp(runner, body.appId);
      }

      const snap = await driver.captureScreen(runner);

      // Adapt to the ElementCatalog shape the frontend already renders
      const toItem = (e: typeof snap.elements[number]) => ({
        id: e.id,
        label: e.label,
        text: e.label,
        // `type` mirrors the Flutter catalog shape the UI renders (chips/labels);
        // `isStatic` lets text elements be counted as static vs dynamic.
        type: e.elementType,
        isStatic: e.elementType === 'text',
        elementType: e.elementType,
        finderStrategy: e.finderStrategy,
        finderValue: e.finderValue,
        fallbackFinders: e.fallbackFinders,
        resourceId: e.resourceId,
        className: e.className,
        bounds: e.bounds,
      });
      // The app under test: explicit pick, else the foreground package detected
      // from the dump — so a recorded test can relaunch it before replaying.
      const detectedAppId = body.appId || snap.currentPackage || '';
      const catalog = {
        packageName: detectedAppId || 'current-screen',
        appId: detectedAppId || undefined,
        projectPath: '',
        platform: body.platform,
        scannedAt: new Date().toISOString(),
        source: 'native-uiautomator',
        unlabeledInteractive: snap.unlabeledInteractive || 0,
        screenshot: snap.screenshot,
        screens: [{
          name: detectedAppId ? `${detectedAppId} — current screen` : 'Current screen',
          inputs: snap.elements.filter(e => e.elementType === 'input').map(toItem),
          buttons: snap.elements.filter(e => e.elementType === 'button').map(toItem),
          texts: snap.elements.filter(e => e.elementType === 'text').map(toItem),
        }],
        inputs: snap.elements.filter(e => e.elementType === 'input').map(toItem),
        buttons: snap.elements.filter(e => e.elementType === 'button').map(toItem),
        texts: snap.elements.filter(e => e.elementType === 'text').map(toItem),
        routes: [],
      };

      logger.info(`[NativeTest] Scan on ${runner.name}: ${catalog.inputs.length} inputs, ${catalog.buttons.length} buttons, ${catalog.texts.length} texts`);
      return successResponse(reply, catalog, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') return errorResponses.validation(reply, error.errors);
      logger.error('[NativeTest] Scan failed:', error);
      return errorResponses.handle(reply, error, 'scan native screen');
    }
  });

  // POST /screen — fresh screenshot + elements (exploratory live view refresh)
  fastify.post('/screen', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { runnerId, platform } = (request.body || {}) as { runnerId?: string; platform?: string };
      const driver = getMobileDriver((platform as any) || 'android');
      const runner = await resolveRunner(runnerId);
      const snap = await driver.captureScreen(runner);
      return successResponse(reply, snap, undefined);
    } catch (error: any) {
      logger.error('[NativeTest] Screen capture failed:', error);
      return errorResponses.handle(reply, error, 'capture native screen');
    }
  });

  // POST /run — replay steps on the device, return result + screenshots
  fastify.post('/run', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const body = runSchema.parse(request.body);
      const driver = getMobileDriver(body.platform);
      const runner = await resolveRunner(body.runnerId);

      logger.info(`[NativeTest] Running ${body.steps.length} steps on ${runner.name}${body.appId ? ` (app: ${body.appId})` : ''}`);
      const result = await driver.runSteps(runner, body.steps as NativeStep[], { appId: body.appId });
      logger.info(`[NativeTest] Run ${result.success ? 'PASSED' : 'FAILED'} in ${result.duration}ms`);

      return successResponse(reply, result, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') return errorResponses.validation(reply, error.errors);
      logger.error('[NativeTest] Run failed:', error);
      return errorResponses.handle(reply, error, 'run native test');
    }
  });
}
