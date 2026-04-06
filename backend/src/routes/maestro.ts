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
}
