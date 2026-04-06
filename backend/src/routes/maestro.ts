import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { successResponse, errorResponses } from '../utils/response';
import { triggerMaestroRun, MAESTRO_WEBHOOK_SECRET } from '../services/maestro';
import { broadcastToOrg } from '../utils/websocket';
import { triggerMaestroSchema, maestroWebhookSchema } from '../types/schemas';
import logger from '../utils/logger';
import prisma from '../config/database';
import { Client } from 'ssh2';
import * as fs from 'fs';

const SSH_HOST = process.env.MAESTRO_RUNNER_HOST || '';
const SSH_USER = process.env.MAESTRO_RUNNER_USER || '';
const SSH_KEY_PATH = process.env.MAESTRO_RUNNER_KEY_PATH || '';
const FLOWS_DIR = '/Users/clawbot/maestro-flows';

// Cache SSH key at module init
let cachedKey: Buffer | null = null;
function getSSHKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!SSH_KEY_PATH) throw new Error('MAESTRO_RUNNER_KEY_PATH environment variable is not set');
  cachedKey = fs.readFileSync(SSH_KEY_PATH);
  return cachedKey;
}

function validateSSHConfig(): void {
  if (!SSH_HOST) throw new Error('MAESTRO_RUNNER_HOST environment variable is not set');
  if (!SSH_USER) throw new Error('MAESTRO_RUNNER_USER environment variable is not set');
  getSSHKey();
}

async function listFlowsOnMac(): Promise<string[]> {
  validateSSHConfig();
  const privateKey = getSSHKey();
  return new Promise((resolve) => {
    const client = new Client();
    let output = '';
    let settled = false;
    const settle = (value: string[]) => { if (!settled) { settled = true; resolve(value); } };

    const timer = setTimeout(() => {
      client.end();
      settle([]);
    }, 20000); // 20s timeout safety net

    client.on('ready', () => {
      client.exec(`ls "${FLOWS_DIR}"/*.yaml 2>/dev/null`, (err, stream) => {
        if (err) { client.end(); clearTimeout(timer); settle([]); return; }
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.on('close', () => {
          client.end();
          clearTimeout(timer);
          const files = output.trim().split('\n').filter(f => f.endsWith('.yaml'));
          settle(files);
        });
      });
    });
    client.on('error', (err) => {
      clearTimeout(timer);
      logger.warn('SSH error listing flows:', err.message);
      settle([]);
    });
    client.connect({ host: SSH_HOST, username: SSH_USER, privateKey, readyTimeout: 15000 });
  });
}

export default async function maestroRoutes(fastify: FastifyInstance) {
  // GET /flows - List available Maestro YAML flows on the Mac runner
  fastify.get('/flows', {
    onRequest: [fastify.authenticate],
  }, async (_request: any, reply) => {
    try {
      const flows = await listFlowsOnMac();
      return successResponse(reply, { flows }, undefined);
    } catch (error: any) {
      logger.error('Error listing Maestro flows:', error);
      return successResponse(reply, { flows: [] }, undefined);
    }
  });

  // POST /trigger - Trigger a Maestro run for a test run
  fastify.post('/trigger', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const body = triggerMaestroSchema.parse(request.body);
      const { testRunId, flowPaths } = body;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: { id: testRunId },
        include: { project: true },
      });

      if (!testRun || testRun.project.organizationId !== organizationId) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const runId = crypto.randomUUID();

      const createdRun = await prisma.maestroRun.create({
        data: {
          testRunId,
          runId,
          status: 'pending',
        },
      });

      // Fire-and-forget: trigger SSH run
      // onRunning fires inside client.on('ready') — before exec returns — so status is accurate
      triggerMaestroRun(
        runId,
        flowPaths,
        async () => {
          await prisma.maestroRun.update({
            where: { id: createdRun.id },
            data: { status: 'running' },
          });
          broadcastToOrg(organizationId, 'maestro_run_update', {
            maestroRunId: createdRun.id,
            status: 'running',
          });
        },
        async (exitCode) => {
          const newStatus = exitCode === 0 ? 'passed' : 'failed';
          logger.info(`[Maestro] Run completed, exitCode: ${exitCode}, setting status: ${newStatus}`);
          try {
            // Pull screenshots from Mac to backend
            const { execSync } = await import('child_process');
            const SSH_HOST = process.env.MAESTRO_RUNNER_HOST || '';
            const SSH_USER = process.env.MAESTRO_RUNNER_USER || '';
            const SSH_KEY = process.env.MAESTRO_RUNNER_KEY_PATH || '';
            const FLOWS_DIR = '/Users/clawbot/maestro-flows';
            const LOCAL_SCREEN_DIR = `/app/uploads/screenshots/${createdRun.id}`;

            if (SSH_HOST && SSH_USER && SSH_KEY) {
              try {
                await import('fs').then(fs => fs.promises.mkdir(LOCAL_SCREEN_DIR, { recursive: true }));
                // Copy all evidence PNGs from Mac flows dir
                await new Promise<void>((resolve) => {
                  execSync(
                    `ssh -o StrictHostKeyChecking=no -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} ` +
                    `"find ${FLOWS_DIR} -name 'evidence_*.png' -o -name 'screenshot_*.png' 2>/dev/null" | tr '\\n' ' '`,
                    { encoding: 'utf-8', timeout: 15000 }
                  );
                  resolve();
                });
                // Pull all screenshots
                const scpResult = execSync(
                  `scp -o StrictHostKeyChecking=no -i ${SSH_KEY} ` +
                  `${SSH_USER}@${SSH_HOST}:${FLOWS_DIR}/evidence_*.png ${LOCAL_SCREEN_DIR}/ 2>/dev/null || true`,
                  { encoding: 'utf-8', timeout: 30000 }
                );
                // Also try from any subdirectory
                execSync(
                  `ssh -o StrictHostKeyChecking=no -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} ` +
                  `"find ${FLOWS_DIR} -name 'evidence_*.png' 2>/dev/null" | while read f; do ` +
                  `scp -o StrictHostKeyChecking=no -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST}:"$f" ${LOCAL_SCREEN_DIR}/ 2>/dev/null; done || true`,
                  { encoding: 'utf-8', timeout: 30000 }
                );

                // Register screenshots in DB
                const fs = await import('fs');
                const files = fs.readdirSync(LOCAL_SCREEN_DIR).filter(f => f.endsWith('.png'));
                if (files.length > 0) {
                  await prisma.maestroScreenshot.createMany({
                    data: files.map((f, i) => ({
                      maestroRunId: createdRun.id,
                      testCaseId: null,
                      stepIndex: i,
                      filePath: `/files/screenshots/${createdRun.id}/${f}`,
                      takenAt: new Date(),
                    })),
                  });
                  logger.info(`[Maestro] Registered ${files.length} screenshots for run ${createdRun.id}`);
                }
              } catch (scpErr) {
                logger.warn('[Maestro] Screenshot pull failed:', scpErr);
              }
            }

            const updated = await prisma.maestroRun.updateMany({
              where: {
                id: createdRun.id,
                status: { in: ['running', 'pending'] },
                completedAt: null,
              },
              data: { status: newStatus, completedAt: new Date() },
            });
            logger.info(`[Maestro] DB updated: ${updated.count} rows`);
            if (updated.count > 0) {
              broadcastToOrg(organizationId, 'maestro_run_update', {
                maestroRunId: createdRun.id,
                status: newStatus,
              });
            }
          } catch (dbErr) {
            logger.error('[Maestro] Failed to update run status:', dbErr);
          }
        },
        async (flowName, status, duration) => {
          logger.info(`[Maestro] Flow update: ${flowName} → ${status} (${duration}s)`);
          broadcastToOrg(organizationId, 'maestro_flow_update', {
            maestroRunId: createdRun.id,
            flowName,
            status,
            duration,
          });
        },
        (line) => {
          broadcastToOrg(organizationId, 'maestro_output', {
            maestroRunId: createdRun.id,
            line,
          });
        },
      ).catch((err) => {
        logger.error('Failed to trigger maestro run:', err);
      });

      return successResponse(reply, {
        maestroRunId: createdRun.id,
        runId,
        status: 'pending',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error triggering maestro run:', error);
      return errorResponses.handle(reply, error, "complete this operation");
    }
  });

  // POST /webhook - Receive Maestro run results
  fastify.post('/webhook', async (request: any, reply) => {
    try {
      const secret = request.headers['x-maestro-secret'];
      const secretBuf = Buffer.from(typeof secret === 'string' ? secret : '');
      const expectedBuf = Buffer.from(MAESTRO_WEBHOOK_SECRET);
      const valid = secretBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(secretBuf, expectedBuf);
      if (!valid) {
        return errorResponses.unauthorized(reply, 'Invalid webhook secret');
      }

      const body = maestroWebhookSchema.parse(request.body);
      const { runId, status, flowCount, passCount, failCount, logUrl, screenshots } = body;

      const maestroRun = await prisma.maestroRun.findUnique({
        where: { runId },
      });

      if (!maestroRun) {
        return errorResponses.notFound(reply, 'Maestro Run');
      }

      await prisma.maestroRun.update({
        where: { runId },
        data: {
          status,
          completedAt: new Date(),
          flowCount,
          passCount,
          failCount,
          logUrl,
        },
      });

      if (screenshots && screenshots.length > 0) {
        await prisma.maestroScreenshot.createMany({
          data: screenshots.map((s) => ({
            maestroRunId: maestroRun.id,
            testCaseId: s.testCaseId,
            stepIndex: s.stepIndex,
            filePath: s.filePath,
            takenAt: new Date(s.takenAt),
          })),
        });
      }

      const testRun = await prisma.testRun.findUnique({
        where: { id: maestroRun.testRunId },
        include: { project: true },
      });

      if (testRun?.project?.organizationId) {
        broadcastToOrg(testRun.project.organizationId, 'maestro_run_update', {
          maestroRunId: maestroRun.id,
          status,
          passCount,
          failCount,
        });
      }

      return reply.code(204).send();
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error processing maestro webhook:', error);
      return errorResponses.handle(reply, error, "complete this operation");
    }
  });

  // GET /runs/:testRunId - List all Maestro runs for a test run
  fastify.get('/runs/:testRunId', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const { testRunId } = request.params;
      const organizationId = request.organizationId;

      const testRun = await prisma.testRun.findFirst({
        where: { id: testRunId },
        include: { project: true },
      });

      if (!testRun || testRun.project.organizationId !== organizationId) {
        return errorResponses.notFound(reply, 'Test Run');
      }

      const runs = await prisma.maestroRun.findMany({
        where: { testRunId },
        include: {
          screenshots: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return successResponse(reply, runs, undefined);
    } catch (error) {
      logger.error('Error listing maestro runs:', error);
      return errorResponses.handle(reply, error, "complete this operation");
    }
  });

  // ─── Flow Builder endpoints ────────────────────────────────────────────────────

  // GET /hierarchy - Capture current screen hierarchy from device
  fastify.get('/hierarchy', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      validateSSHConfig();
      const key = getSSHKey();

      // Use XML parser via adb pull approach
      const sshResult = await new Promise<{ output: string; error: string; code: number }>((resolve, reject) => {
        let output = '';
        let error = '';
        const client = new Client();

        client.on('ready', () => {
          // ONLY capture current screen — DO NOT press any keys
          // User should dismiss keyboard manually before clicking Capture
          const prepCmd = 'export JAVA_HOME="/Users/clawbot/jdk17/Contents/Home" && ' +
            'export ANDROID_HOME="/Users/clawbot/Library/Android/sdk" && ' +
            'export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ' +
            // Just dump hierarchy — no key events
            'adb shell uiautomator dump /sdcard/ui.xml 2>/dev/null && adb shell cat /sdcard/ui.xml 2>/dev/null';
          client.exec(prepCmd, (err, stream) => {
            if (err) { client.end(); reject(err); return; }
            stream.on('data', (d: Buffer) => { output += d.toString(); });
            stream.stderr.on('data', (d: Buffer) => { error += d.toString(); });
            stream.on('close', (code: number | null) => {
              client.end();
              resolve({ output, error, code: code ?? -1 });
            });
          });
        });
        client.on('error', (e) => reject(e));
        client.connect({ host: SSH_HOST, username: SSH_USER, privateKey: key, readyTimeout: 30000 });
      });

      if (!sshResult.output || sshResult.output.length < 100) {
        return errorResponses.handle(reply, new Error(`Failed to capture hierarchy: ${sshResult.error}`), "capture hierarchy");
      }

      // Parse XML to extract UI elements
      // Look for <node ... /> or <node ...> tags
      const elements: Array<{
        text: string;
        hint?: string;
        resourceId?: string;
        className?: string;
        clickable: boolean;
        enabled: boolean;
        scrollable: boolean;
        bounds?: string;
      }> = [];

      const seenTexts = new Set<string>();

      // Match all <node .../> or <node ...> tags
      const nodeRegex = /<node\s+([^>]*)\/?>/g;
      let nodeMatch;

      while ((nodeMatch = nodeRegex.exec(sshResult.output)) !== null) {
        const attrs = nodeMatch[1];
        const attrMap: Record<string, string> = {};

        // Extract attributes: key="value" or key='value'
        const kvRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
        let kvMatch;
        while ((kvMatch = kvRegex.exec(attrs)) !== null) {
          attrMap[kvMatch[1]] = kvMatch[2];
        }

        // Get text from content-desc (Flutter apps use this instead of text)
        const contentDesc = attrMap['content-desc'] || '';
        let text = attrMap.text || contentDesc;
        const resourceId = attrMap['resource-id'] || '';
        const className = attrMap.class || '';
        const clickable = attrMap.clickable === 'true';
        const enabled = attrMap.enabled !== 'false';
        const scrollable = attrMap.scrollable === 'true';
        const bounds = attrMap.bounds || '';
        const naf = attrMap.NAF === 'true';

        // Include EditText (input fields) even without text — they're important interactive elements
        const isInputField = className.includes('EditText') || className.includes('TextInput');
        const hasBounds = bounds && bounds !== '[0,0][0,0]';

        // Parse bounds to get center coordinates: "[left,top][right,bottom]" → center as %
        // Also compute approximate Y-position label for reference
        let tapCoords: string | undefined;
        let centerYPercent: number | undefined;
        if (hasBounds && bounds.includes('][')) {
          const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
          if (match) {
            const x1 = parseInt(match[1]);
            const y1 = parseInt(match[2]);
            const x2 = parseInt(match[3]);
            const y2 = parseInt(match[4]);
            const centerX = Math.round(((x1 + x2) / 2) / 1080 * 100);
            const centerY = Math.round(((y1 + y2) / 2) / 2218 * 100);
            tapCoords = `${centerX}%,${centerY}%`;
            centerYPercent = centerY;
          }
        }

        // Only include elements with meaningful text OR interactive input fields
        if (text && text.length >= 2 && text.length < 100 && !seenTexts.has(text)) {
          seenTexts.add(text);
          elements.push({
            text,
            resourceId: resourceId || undefined,
            className,
            clickable,
            enabled,
            scrollable,
            bounds: bounds || undefined,
          });
        } else if (isInputField && clickable && hasBounds && tapCoords && !seenTexts.has(`[coord:${tapCoords}]`)) {
          // For input fields: use the className as a hint for the label
          // EditText + password=true → "Password", else → "Email/Input"
          const isPassword = attrMap.password === 'true';
          const label = isPassword ? 'Password' : 'Email/Input';
          const uniqueKey = `[coord:${tapCoords}]`;
          seenTexts.add(uniqueKey);
          elements.push({
            // Use label as text so user sees "Password" or "Email/Input"
            text: label,
            resourceId: resourceId || undefined,
            className,
            clickable: true,
            enabled,
            scrollable: false,
            // Store metadata as JSON in bounds field
            bounds: JSON.stringify({
              label,
              coords: tapCoords,
              yPercent: centerYPercent,
              resourceId: resourceId || undefined,
            }),
          });
        }
      }

      logger.info(`[FlowBuilder] Captured ${elements.length} UI elements from ${sshResult.output.length} chars of XML`);
      return successResponse(reply, { elements, rawLength: sshResult.output.length }, undefined);
    } catch (error) {
      logger.error('Error capturing hierarchy:', error);
      return errorResponses.handle(reply, error, "capture hierarchy");
    }
  });

  // POST /flows - Save YAML flows to Mac runner AND to DB
  fastify.post('/flows', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      logger.info(`[FlowBuilder] Save request: body keys=${Object.keys(request.body || {})}`);
      validateSSHConfig();
      const { appId, flows, clearFirst } = request.body as {
        appId: string;
        flows: Array<{ name: string; yaml: string }>;
        clearFirst?: boolean;
        suiteId?: string;
      };

      if (!flows || flows.length === 0) {
        return errorResponses.validation(reply, [{ message: 'No flows provided', path: ['flows'] }]);
      }

      const key = getSSHKey();
      const client = new Client();

      // Clear existing flows if requested
      if (clearFirst) {
        await new Promise<void>((resolve, reject) => {
          client.on('ready', () => {
            client.exec(`rm -f ${FLOWS_DIR}/*.yaml 2>/dev/null; mkdir -p ${FLOWS_DIR}`, (err) => {
              client.end();
              if (err) reject(err);
              else resolve();
            });
          });
          client.on('error', reject);
          client.connect({ host: SSH_HOST, username: SSH_USER, privateKey: key, readyTimeout: 15000 });
        });
      }

      const savedPaths: string[] = [];
      for (const flow of flows) {
        const safeName = flow.name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
        const remotePath = `${FLOWS_DIR}/${safeName}.yaml`;
        // Escape single quotes for shell
        const escaped = flow.yaml.replace(/'/g, "'\\''");

        await new Promise<void>((resolve, reject) => {
          const conn = new Client();
          conn.on('ready', () => {
            conn.exec(`mkdir -p ${FLOWS_DIR} && printf '%s' '${escaped}' > ${remotePath}`, (err) => {
              conn.end();
              if (err) reject(err);
              else resolve();
            });
          });
          conn.on('error', reject);
          conn.connect({ host: SSH_HOST, username: SSH_USER, privateKey: key, readyTimeout: 15000 });
        });
        savedPaths.push(remotePath);
      }

      logger.info(`[FlowBuilder] Saved ${savedPaths.length} flows to Mac`);
      return successResponse(reply, { saved: savedPaths.length, paths: savedPaths }, undefined);
    } catch (error) {
      logger.error(`[FlowBuilder] Error saving flows: ${error instanceof Error ? error.message : String(error)}`);
      return errorResponses.handle(reply, error, "save flows");
    }
  });

  // POST /flows/db - Save flows to DB only (for Page Automation pool)
  fastify.post('/flows/db', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext, fastify.authorize('admin', 'manager', 'tester')],
  }, async (request: any, reply) => {
    try {
      const { name, yaml, orderIndex, savedPath, suiteId } = request.body as {
        name: string;
        yaml: string;
        orderIndex?: number;
        savedPath?: string;
        suiteId?: string;
      };

      if (!name || !yaml) {
        return errorResponses.validation(reply, [{ message: 'name and yaml required', path: ['name', 'yaml'] }]);
      }

      // If suiteId provided, verify it belongs to org
      if (suiteId) {
        const suite = await prisma.testSuite.findFirst({
          where: { id: suiteId, project: { organizationId: request.organizationId } },
        });
        if (!suite) return errorResponses.notFound(reply, 'Test Suite');
      } else {
        // No suite provided - find or create a "Page Automation" default suite
        const defaultProject = await prisma.project.findFirst({
          where: { organizationId: request.organizationId },
        });
        if (!defaultProject) return errorResponses.notFound(reply, 'No projects in organization');

        let defaultSuite = await prisma.testSuite.findFirst({
          where: { projectId: defaultProject.id, name: 'Page Automation' },
        });
        if (!defaultSuite) {
          defaultSuite = await prisma.testSuite.create({
            data: { name: 'Page Automation', description: 'Auto-generated from Page Automation', projectId: defaultProject.id },
          });
        }
        // Use the default suite
        const maxOrder = await prisma.maestroFlow.aggregate({
          where: { testSuiteId: defaultSuite.id },
          _max: { orderIndex: true },
        });
        const flow = await prisma.maestroFlow.create({
          data: {
            name,
            yaml,
            orderIndex: orderIndex ?? (maxOrder._max?.orderIndex ?? -1) + 1,
            savedPath: savedPath || null,
            testSuiteId: defaultSuite.id,
          },
        });
        return successResponse(reply, flow, undefined);
      }

      // Suite provided - save directly
      const maxOrder = await prisma.maestroFlow.aggregate({
        where: { testSuiteId: suiteId },
        _max: { orderIndex: true },
      });
      const flow = await prisma.maestroFlow.create({
        data: {
          name,
          yaml,
          orderIndex: orderIndex ?? (maxOrder._max?.orderIndex ?? -1) + 1,
          savedPath: savedPath || null,
          testSuiteId: suiteId,
        },
      });

      logger.info(`[FlowBuilder] Saved flow "${name}" to suite ${suiteId}`);
      return successResponse(reply, flow, undefined);
    } catch (error: any) {
      logger.error('Error saving flow to DB:', error);
      return errorResponses.handle(reply, error, 'save flow');
    }
  });
}
