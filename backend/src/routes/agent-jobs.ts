import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { successResponse, errorResponses, errorResponse } from '../utils/response';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const prisma = new PrismaClient();

const QUEUE_KEY = 'queue:agent-jobs';
const JOB_TTL_SECONDS = 60 * 60 * 24; // job payload cache 24h
const STALE_CLAIM_SECONDS = 60;       // claimed w/o heartbeat → requeue

function redis(): Redis {
  return new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
}

// ─── GET /agent-jobs — list (filter by status/type) ──────────────────────
export default async function agentJobRoutes(fastify: FastifyInstance) {

  // worker token OR user JWT (workers only hold shared token)
  const workerOrUserAuth = async (req: any, reply: any) => {
    const wt = req.headers["x-worker-token"];
    if (process.env.AGENT_WORKER_TOKEN && wt === process.env.AGENT_WORKER_TOKEN) {
      (req as any).workerId = (req.headers["x-worker-id"] as string) || "worker-unknown";
      return;
    }
    await fastify.authenticate(req, reply);
  };

  const requireClaimer = async (req: any, reply: any) => {
    const job = await prisma.agentJob.findUnique({ where: { id: (req.params as any).id } });
    if (!job) return errorResponses.notFound(reply, "Job");
    const wid = (req as any).workerId;
    if (wid && job.claimedBy !== wid) {
      return errorResponse(reply, "JOB_NOT_CLAIMED_BY_WORKER", "job is claimed by another worker", 403);
    }
  };

  // LIST
  fastify.get('/agent-jobs', { onRequest: [fastify.authenticate] }, async (req: any, reply) => {
    try {
      const { status, type, take = 50 } = req.query as Record<string, string>;
      const jobs = await prisma.agentJob.findMany({
        where: {
          ...(status ? { status: status as any } : {}),
          ...(type ? { type: type as any } : {}),
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: Math.min(Number(take), 200),
      });
      return successResponse(reply, jobs);
    } catch (err) {
      fastify.log.error(err);
      return errorResponses.internal(reply);
    }
  });

  // ENQUEUE — create + push to Redis queue
  fastify.post('/agent-jobs', { onRequest: [fastify.authenticate] }, async (req: any, reply) => {
    try {
      const body = req.body as Record<string, any>;
      const jobId = randomUUID();
      const job = await prisma.agentJob.create({
        data: {
          id: jobId,
          type: body.type,
          priority: body.priority ?? 5,
          appId: body.appId ?? null,
          platform: body.platform ?? 'android',
          target: body.target ?? {},
          credentialsRef: body.credentialsRef ?? null,
          guardrails: body.guardrails ?? {},
          runnerId: body.runnerId ?? null,
          deviceId: body.deviceId ?? null,
          requestedBy: req.user?.id ?? null,
          status: 'queued',
        },
      });
      const r = redis();
      await r.zadd(QUEUE_KEY, Date.now(), jobId);
      await r.set(`job:${jobId}:payload`, JSON.stringify(body ?? {}), 'EX', JOB_TTL_SECONDS);
      r.disconnect();
      reply.status(201);
      return successResponse(reply, job);
    } catch (err) {
      fastify.log.error(err);
      return errorResponses.internal(reply);
    }
  });

  // CLAIM — worker: atomically pop highest-priority oldest queued job
  // (auth: worker token via header x-worker-token; simple shared secret for now)
  fastify.post('/agent-jobs/claim', async (req, reply) => {
    const workerId = (req.headers['x-worker-id'] as string) || 'worker-unknown';
    if (!process.env.AGENT_WORKER_TOKEN || req.headers['x-worker-token'] !== process.env.AGENT_WORKER_TOKEN) {
      return errorResponses.unauthorized(reply);
    }
    const r = redis();
    try {
      // scan queued jobs from DB (source of truth), pick by priority+age
      const candidates = await prisma.agentJob.findMany({
        where: { status: 'queued' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: 1,
      });
      const job = candidates[0];
      if (!job) {
        r.disconnect();
        return successResponse(reply, null); // empty queue
      }
      const claimed = await prisma.agentJob.updateMany({
        where: { id: job.id, status: 'queued' }, // optimistic lock
        data: { status: 'claimed', claimedBy: workerId, claimedAt: new Date(), heartbeatAt: new Date() },
      });
      if (claimed.count === 0) {
        r.disconnect();
        return successResponse(reply, null); // lost race, try again
      }
      const fresh = await prisma.agentJob.findUnique({ where: { id: job.id } });
      r.disconnect();
      return successResponse(reply, fresh);
    } catch (err) {
      fastify.log.error(err);
      r.disconnect();
      return errorResponses.internal(reply);
    }
  });

  // HEARTBEAT / STATUS — worker updates running state
  fastify.patch('/agent-jobs/:id', { preHandler: [workerOrUserAuth, requireClaimer], bodyLimit: 15 * 1024 * 1024 }, async (req: any, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as Record<string, any>;
      const data: Record<string, any> = {};
      for (const k of ['status', 'summary', 'result', 'error', 'artifactIds']) {
        if (body[k] !== undefined) data[k] = body[k];
      }
      if (body.status === 'running') data.heartbeatAt = new Date();
      const job = await prisma.agentJob.update({ where: { id }, data });
      return successResponse(reply, job);
    } catch (err) {
      fastify.log.error(err);
      return errorResponses.internal(reply);
    }
  });

  // SWEEP — requeue stale claims (no heartbeat for 60s); call via cron
  fastify.post('/agent-jobs/sweep', { onRequest: [workerOrUserAuth] }, async (_req, reply) => {
    try {
      const cutoff = new Date(Date.now() - STALE_CLAIM_SECONDS * 1000);
      const stale = await prisma.agentJob.findMany({
        where: { status: 'claimed', heartbeatAt: { lt: cutoff } },
      });
      for (const job of stale) {
        await prisma.agentJob.update({ where: { id: job.id }, data: { status: 'queued', claimedBy: null, claimedAt: null } });
      }
      return successResponse(reply, { requeued: stale.length });
    } catch (err) {
      fastify.log.error(err);
      return errorResponses.internal(reply);
    }
  });
}
