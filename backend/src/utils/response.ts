import { FastifyReply } from 'fastify';

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages?: number;
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
  unauthorized: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'AUTH_INVALID', messageOrDetails || 'Invalid authentication credentials', 401);
    }
    return errorResponse(reply, 'AUTH_INVALID', messageOrDetails?.message || 'Invalid authentication credentials', 401, messageOrDetails?.details);
  },

  forbidden: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'PERMISSION_DENIED', messageOrDetails || 'Insufficient permissions', 403);
    }
    return errorResponse(reply, 'PERMISSION_DENIED', messageOrDetails?.message || 'Insufficient permissions', 403, messageOrDetails?.details);
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

  tooManyRequests: (reply: FastifyReply, messageOrDetails?: string | { message?: string; details?: any }) => {
    if (typeof messageOrDetails === 'string') {
      return errorResponse(reply, 'TOO_MANY_REQUESTS', messageOrDetails || 'Too many requests', 429);
    }
    return errorResponse(reply, 'TOO_MANY_REQUESTS', messageOrDetails?.message || 'Too many requests', 429, messageOrDetails?.details);
  },

  rateLimit: (reply: FastifyReply) =>
    errorResponse(reply, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 429),

  internal: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'INTERNAL_ERROR', message || 'Internal server error', 500),
};
