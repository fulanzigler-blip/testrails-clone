import { FastifyReply } from 'fastify';

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages?: number;
  unreadCount?: number;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any[];
    [key: string]: any; // Allow additional properties
  };
}

// Success response helper
export function successResponse<T>(reply: FastifyReply, data: T, meta?: PaginationMeta) {
  const response: SuccessResponse<T> = { success: true, data };
  if (meta) {
    response.meta = meta;
  }
  return reply.send(response);
}

// Error response helper
export function errorResponse(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode: number = 400,
  details?: any[]
) {
  const response: ErrorResponse = {
    success: false,
    error: { code, message, details },
  };
  return reply.code(statusCode).send(response);
}

// Common error responses
export const errorResponses = {
  unauthorized: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any; [key: string]: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'AUTH_INVALID', messageOrDetails || 'Invalid authentication credentials', 401);
    }
    const { message, details, ...extra } = messageOrDetails || {};
    const errorObj: any = { code: 'AUTH_INVALID', message: message || 'Invalid authentication credentials', details };
    Object.assign(errorObj, extra);
    return reply.code(401).send({
      success: false,
      error: errorObj,
    });
  },

  forbidden: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any; [key: string]: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'PERMISSION_DENIED', messageOrDetails || 'Insufficient permissions', 403);
    }
    const { message, details, ...extra } = messageOrDetails || {};
    const errorObj: any = { code: 'PERMISSION_DENIED', message: message || 'Insufficient permissions', details };
    Object.assign(errorObj, extra);
    return reply.code(403).send({
      success: false,
      error: errorObj,
    });
  },

  notFound: (reply: FastifyReply, resource: string = 'Resource') =>
    errorResponse(reply, 'NOT_FOUND', `${resource} not found`, 404),

  conflict: (reply: FastifyReply, message: string) =>
    errorResponse(reply, 'CONFLICT', message, 409),

  badRequest: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'BAD_REQUEST', messageOrDetails || 'Bad request', 400);
    }
    return errorResponse(reply, 'BAD_REQUEST', messageOrDetails?.message || 'Bad request', 400, messageOrDetails?.details);
  },

  validation: (reply: FastifyReply, details: any[]) =>
    errorResponse(reply, 'VALIDATION_ERROR', 'Invalid input data', 400, details),

  tooManyRequests: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any; [key: string]: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'TOO_MANY_REQUESTS', messageOrDetails || 'Too many requests', 429);
    }
    const { message, details, ...extra } = messageOrDetails || {};
    const errorObj: any = { code: 'TOO_MANY_REQUESTS', message: message || 'Too many requests', details };
    Object.assign(errorObj, extra);
    return reply.code(429).send({
      success: false,
      error: errorObj,
    });
  },

  rateLimit: (reply: FastifyReply) =>
    errorResponse(reply, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 429),

  internal: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'INTERNAL_ERROR', message || 'Internal server error', 500),

  // Smart error handler — auto-detects error type and returns user-friendly message
  handle: (reply: FastifyReply, error: Error, context?: string) => {
    const msg = error.message || '';

    // SSH / connectivity errors
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return reply.code(503).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Mac runner timed out. Please ensure the Mac is awake and connected to the network, then try again.',
        },
      });
    }
    if (msg.startsWith('ADB screencap returned no data') || msg.includes('ADB') && msg.includes('no data')) {
      return reply.code(503).send({
        success: false,
        error: {
          code: 'DEVICE_NOT_AVAILABLE',
          message: msg,
        },
      });
    }
    if (msg.includes('SSH') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || /\bconnect(ion)?\b/i.test(msg)) {
      return reply.code(503).send({
        success: false,
        error: {
          code: 'CONNECTION_FAILED',
          message: `Cannot connect to Mac runner: ${msg}. Check SSH connectivity and ensure the device is on the same network.`,
        },
      });
    }

    // AI generation errors
    if (msg.startsWith('CRAWL_GENERATION_FAILED')) {
      const [, reason] = msg.split(':');
      return reply.code(422).send({
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: `AI failed to generate test cases: ${reason?.trim() || 'Unknown error'}. Please try again.`,
        },
      });
    }

    // Database / Prisma errors
    if (msg.includes('P2002') || msg.includes('Unique constraint')) {
      return reply.code(409).send({
        success: false,
        error: { code: 'CONFLICT', message: 'This record already exists.' },
      });
    }
    if (msg.includes('P2025') || msg.includes('record not found')) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'The requested record was not found.' },
      });
    }

    // Zod validation
    if (error.name === 'ZodError') {
      const details = (error as any).errors?.map((e: any) => ({
        field: e.path?.join('.'),
        message: e.message,
      })) || [];
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input data', details },
      });
    }

    // JWT errors
    if (msg.includes('expired') || msg.includes('EXPIRED')) {
      return reply.code(401).send({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Your session has expired. Please log in again.' },
      });
    }

    // Fallback: generic internal error
    const contextMsg = context ? `Failed to ${context}: ${msg}` : 'An unexpected error occurred. Please try again.';
    return reply.code(500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: contextMsg },
    });
  },
};
