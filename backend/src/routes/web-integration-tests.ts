import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import { z } from 'zod';
import { successResponse, errorResponses } from '../utils/response';
import logger from '../utils/logger';
import prisma from '../config/database';
import { scanWebProject, WebElementCatalog, WebAuthConfig, ScanProgressCallback } from '../utils/web-element-scraper';
import { runWebTest, generatePlaywrightCode, WebTestStep } from '../utils/playwright-test-runner';
import { createSession, loadPage, clickAndNavigate, destroySession, getSessionInfo, exportStorageState } from '../utils/web-session-manager';

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

// ─── Schemas ───────────────────────────────────────────────────────────────────

const scanAuthSchema = z.object({
  loginUrl: z.string().url().or(z.literal('')).optional().transform(v => v || undefined),
  usernameSelector: z.string().min(1),
  usernameValue: z.string().min(1),
  passwordSelector: z.string().min(1),
  passwordValue: z.string().min(1),
  submitSelector: z.string().optional().transform(v => v || undefined),
  waitAfterLogin: z.number().int().min(0).max(10000).optional(),
});

const scanWebSchema = z.object({
  url: z.string().url('Valid URL is required'),
  maxPages: z.number().int().min(1).max(50).default(20).optional(),
  maxDepth: z.number().int().min(0).max(5).default(3).optional(),
  auth: scanAuthSchema.optional(),
});

const generateWebTestSchema = z.object({
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    elementId: z.string().optional(),
    selector: z.string().optional(),
    value: z.string().optional(),
    value2: z.string().optional(),
    text: z.string().optional(),
  })).min(1, 'At least one step is required'),
  baseUrl: z.string().url().optional(),
});

const runWebTestSchema = z.object({
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    elementId: z.string().optional(),
    selector: z.string().optional(),
    value: z.string().optional(),
    value2: z.string().optional(),
    text: z.string().optional(),
  })).min(1, 'At least one step is required'),
  baseUrl: z.string().url().optional(),
  auth: scanAuthSchema.optional(),
  sessionId: z.string().uuid().optional(),
});

const startSessionSchema = z.object({
  auth: scanAuthSchema.optional(),
  viewport: z.object({
    width: z.number().int().min(320).max(2560).default(1280),
    height: z.number().int().min(240).max(1440).default(720),
  }).optional(),
});

const loadPageSchema = z.object({
  url: z.string().url('Valid URL required'),
});

const saveWebTestCaseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  suiteId: z.string().uuid().optional(),
  steps: z.array(z.any()),
  generatedCode: z.string().min(1, 'Generated code is required'),
  baseUrl: z.string().url().optional(),
  testResult: z.object({
    success: z.boolean(),
    output: z.string(),
    duration: z.number(),
  }).optional(),
});

// ─── Route Handlers ────────────────────────────────────────────────────────────

export default async function webIntegrationRoutes(fastify: FastifyInstance) {
  // Get available web test step types
  fastify.get('/web-test-steps', async (request: FastifyRequest, reply: FastifyReply) => {
    return successResponse(reply, {
      stepTypes: [
        { type: 'navigate', label: 'Navigate', icon: 'MousePointerClick', desc: 'Go to a URL', category: 'Navigation' },
        { type: 'tap', label: 'Click', icon: 'MousePointerClick', desc: 'Click an element', category: 'Interactions' },
        { type: 'enter_text', label: 'Enter Text', icon: 'Type', desc: 'Fill an input field', category: 'Interactions' },
        { type: 'hover', label: 'Hover', icon: 'MousePointerClick', desc: 'Hover over an element', category: 'Interactions' },
        { type: 'select', label: 'Select Option', icon: 'Type', desc: 'Select from dropdown', category: 'Interactions' },
        { type: 'check', label: 'Check', icon: 'MousePointerClick', desc: 'Check a checkbox', category: 'Interactions' },
        { type: 'uncheck', label: 'Uncheck', icon: 'MousePointerClick', desc: 'Uncheck a checkbox', category: 'Interactions' },
        { type: 'press_key', label: 'Press Key', icon: 'ArrowUp', desc: 'Press a keyboard key', category: 'Navigation' },
        { type: 'assert_visible', label: 'Assert Visible', icon: 'Eye', desc: 'Verify element is visible', category: 'Assertions' },
        { type: 'assert_not_visible', label: 'Assert Not Visible', icon: 'EyeOff', desc: 'Verify element is hidden', category: 'Assertions' },
        { type: 'assert_text', label: 'Assert Text', icon: 'Type', desc: 'Verify text content', category: 'Assertions' },
        { type: 'wait', label: 'Wait', icon: 'Clock', desc: 'Wait for N ms', category: 'Utilities' },
        { type: 'screenshot', label: 'Screenshot', icon: 'Eye', desc: 'Take a screenshot', category: 'Utilities' },
        { type: 'set_viewport', label: 'Set Viewport', icon: 'Type', desc: 'Set browser viewport size', category: 'Utilities' },
      ],
      devices: {
        desktop: [
          { id: '', label: 'Desktop (1280x720)', icon: '🖥️' },
          { id: '1920x1080', label: 'Full HD (1920x1080)', icon: '🖥️' },
          { id: '1440x900', label: 'Laptop (1440x900)', icon: '💻' },
        ],
        mobile: [
          { id: 'iPhone 15', label: 'iPhone 15 (393x852)', icon: '📱' },
          { id: 'iPhone 14', label: 'iPhone 14 (390x844)', icon: '📱' },
          { id: 'Pixel 7', label: 'Google Pixel 7 (412x892)', icon: '📱' },
          { id: 'Pixel 5', label: 'Google Pixel 5 (393x851)', icon: '📱' },
          { id: 'Galaxy S23', label: 'Samsung Galaxy S23 (384x854)', icon: '📱' },
          { id: 'iPad Mini', label: 'iPad Mini (768x1024)', icon: '📟' },
          { id: 'iPad Pro 11', label: 'iPad Pro 11" (834x1194)', icon: '📟' },
        ],
      },
    });
  });

  // Scan a web URL — streams progress via SSE, final event is { type: 'complete', catalog }
  fastify.post('/scan', async (request: FastifyRequest, reply: FastifyReply) => {
    // Validate before hijacking so we can still return a normal error response
    let body: z.infer<typeof scanWebSchema>;
    try {
      body = scanWebSchema.parse(request.body);
    } catch (err: any) {
      logger.error(`[WebTest] Scan validation failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Invalid request');
    }

    const config = { maxPages: body.maxPages, maxDepth: body.maxDepth };
    logger.info(`[WebTest] Scanning URL: ${body.url}${body.auth ? ' (with auth)' : ''}`);

    // Hijack the response so Fastify doesn't interfere with our SSE stream
    reply.hijack();
    const res = reply.raw;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if behind a proxy

    const send = (data: object) => {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client disconnected */ }
    };

    try {
      const onProgress: ScanProgressCallback = (event) => send(event);
      const catalog = await scanWebProject(body.url, config, body.auth as WebAuthConfig | undefined, onProgress);
      send({ type: 'complete', catalog });
    } catch (err: any) {
      logger.error(`[WebTest] Scan failed: ${err.message}`);
      send({ type: 'error', message: err.message || 'Scan failed' });
    } finally {
      res.end();
    }
  });

  // Generate Playwright code from steps
  fastify.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateWebTestSchema.parse(request.body);
      const steps: WebTestStep[] = body.steps as WebTestStep[];
      const device = (body as any).device;

      const code = generatePlaywrightCode(steps, body.baseUrl, device);

      return successResponse(reply, { playwrightCode: code });
    } catch (err: any) {
      logger.error(`[WebTest] Generate failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Generation failed');
    }
  });

  // Run web test
  fastify.post('/run', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = runWebTestSchema.parse(request.body);
      const steps: WebTestStep[] = body.steps as WebTestStep[];
      const device = (body as any).device;

      // If a live exploratory session is provided, export its cookies so the test runner
      // can reuse the authenticated state without triggering a second login.
      let storageState: object | undefined;
      if (body.sessionId) {
        const exported = await exportStorageState(body.sessionId);
        if (exported) {
          storageState = exported;
          logger.info(`[WebTest] Using storage state from session ${body.sessionId}`);
        }
      }

      logger.info(`[WebTest] Running test with ${steps.length} steps${device ? ` (device: ${device})` : ''}${storageState ? ' (session cookies)' : body.auth ? ' (re-login)' : ''}`);
      const result = await runWebTest(steps, body.baseUrl, device, body.auth as WebAuthConfig | undefined, storageState);

      const relativeScreenshots = result.screenshots.map(p =>
        path.relative(UPLOADS_ROOT, p).replace(/\\/g, '/')
      );

      return successResponse(reply, {
        success: result.success,
        output: result.output,
        duration: result.duration,
        screenshots: relativeScreenshots,
      });
    } catch (err: any) {
      logger.error(`[WebTest] Run failed: ${err.message}`);
      return errorResponses.internal(reply, err.message || 'Run failed');
    }
  });

  // Save as test case
  fastify.post('/save-testcase', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = saveWebTestCaseSchema.parse(request.body);

      const userId = (request.user as any).userId as string;

      // Create test case in DB
      const testCase = await prisma.testCase.create({
        data: {
          title: body.title,
          description: body.description || (body.baseUrl ? `Web test for ${body.baseUrl}` : 'Web test'),
          priority: (body.priority as any) || 'medium',
          automationType: 'automated' as any,
          suiteId: body.suiteId || null,
          customFields: {
            type: 'web',
            steps: body.steps,
            playwrightCode: body.generatedCode,
            baseUrl: body.baseUrl,
          },
          createdById: userId,
        },
      });

      // Add to suite members if suite is provided
      if (body.suiteId) {
        await prisma.testSuiteMember.create({
          data: { testSuiteId: body.suiteId, testCaseId: testCase.id },
        }).catch(() => {}); // ignore if already exists
      }

      logger.info(`[WebTest] Saved test case: ${testCase.id}`);

      return successResponse(reply, {
        id: testCase.id,
        title: testCase.title,
      });
    } catch (err: any) {
      logger.error(`[WebTest] Save failed: ${err.message}`);
      return errorResponses.internal(reply, err.message || 'Save failed');
    }
  });

  // ─── Exploratory Session Routes ─────────────────────────────────────────────

  // Start a new browser session (optional pre-login)
  fastify.post('/session', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = startSessionSchema.parse(request.body);
      const vp = body.viewport;
      const viewport = { width: vp?.width ?? 1280, height: vp?.height ?? 720 };
      const sessionId = await createSession(body.auth as WebAuthConfig | undefined, viewport);
      return successResponse(reply, { sessionId });
    } catch (err: any) {
      logger.error(`[WebTest] Session start failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Failed to start session');
    }
  });

  // Load a page in an existing session — returns screenshot + elements
  fastify.post('/session/:id/load', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = loadPageSchema.parse(request.body);
      const snapshot = await loadPage(id, body.url);
      return successResponse(reply, snapshot);
    } catch (err: any) {
      logger.error(`[WebTest] Page load failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Failed to load page');
    }
  });

  // Click an element and return new snapshot (for SPA navigation)
  fastify.post('/session/:id/click', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = z.object({ selector: z.string().min(1) }).parse(request.body);
      const snapshot = await clickAndNavigate(id, body.selector);
      return successResponse(reply, snapshot);
    } catch (err: any) {
      logger.error(`[WebTest] Click-navigate failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Failed to click element');
    }
  });

  // Get session info (alive check)
  fastify.get('/session/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const info = getSessionInfo(id);
    if (!info) return errorResponses.notFound(reply, 'Session not found');
    return successResponse(reply, info);
  });

  // End a session
  fastify.delete('/session/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      await destroySession(id);
      return successResponse(reply, { ok: true });
    } catch (err: any) {
      logger.error(`[WebTest] Session destroy failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Failed to end session');
    }
  });
}
