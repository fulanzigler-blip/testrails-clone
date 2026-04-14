import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponses } from '../utils/response';
import logger from '../utils/logger';
import prisma from '../config/database';
import { scanWebProject, WebElementCatalog } from '../utils/web-element-scraper';
import { runWebTest, generatePlaywrightCode, WebTestStep } from '../utils/playwright-test-runner';

// ─── Schemas ───────────────────────────────────────────────────────────────────

const scanWebSchema = z.object({
  url: z.string().url('Valid URL is required'),
  maxPages: z.number().int().min(1).max(50).default(20).optional(),
  maxDepth: z.number().int().min(0).max(5).default(3).optional(),
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
});

const saveWebTestCaseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  steps: z.array(z.any()),
  generatedCode: z.string().min(1, 'Generated code is required'),
  baseUrl: z.string().url(),
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
    });
  });

  // Scan a web URL
  fastify.post('/scan', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = scanWebSchema.parse(request.body);
      const config = {
        maxPages: body.maxPages,
        maxDepth: body.maxDepth,
      };

      logger.info(`[WebTest] Scanning URL: ${body.url}`);
      const catalog = await scanWebProject(body.url, config);

      return successResponse(reply, catalog);
    } catch (err: any) {
      logger.error(`[WebTest] Scan failed: ${err.message}`);
      return errorResponses.badRequest(reply, err.message || 'Scan failed');
    }
  });

  // Generate Playwright code from steps
  fastify.post('/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = generateWebTestSchema.parse(request.body);
      const steps: WebTestStep[] = body.steps as WebTestStep[];

      const code = generatePlaywrightCode(steps, body.baseUrl);

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

      logger.info(`[WebTest] Running test with ${steps.length} steps`);
      const result = await runWebTest(steps, body.baseUrl);

      return successResponse(reply, {
        success: result.success,
        output: result.output,
        duration: result.duration,
        screenshots: result.screenshots,
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

      // Create test case in DB
      const testCase = await prisma.testCase.create({
        data: {
          title: body.title,
          description: `Web test for ${body.baseUrl}`,
          customFields: {
            type: 'web',
            steps: body.steps,
            playwrightCode: body.generatedCode,
            baseUrl: body.baseUrl,
          },
          createdBy: (request.user as any)?.userId || 'system',
        },
      });

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
}
