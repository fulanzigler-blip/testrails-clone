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
  unauthorized: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'AUTH_INVALID', message || 'Invalid authentication credentials', 401),

  forbidden: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'PERMISSION_DENIED', message || 'Insufficient permissions', 403),

  notFound: (reply: FastifyReply, resource: string = 'Resource') =>
    errorResponse(reply, 'NOT_FOUND', `${resource} not found`, 404),

  conflict: (reply: FastifyReply, message: string) =>
    errorResponse(reply, 'CONFLICT', message, 409),

  badRequest: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'BAD_REQUEST', message || 'Bad request', 400),

  validation: (reply: FastifyReply, details: any[]) =>
    errorResponse(reply, 'VALIDATION_ERROR', 'Invalid input data', 400, details),

  tooManyRequests: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'TOO_MANY_REQUESTS', message || 'Too many requests', 429),

  rateLimit: (reply: FastifyReply) =>
    errorResponse(reply, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 429),

  internal: (reply: FastifyReply, message?: string) =>
    errorResponse(reply, 'INTERNAL_ERROR', message || 'Internal server error', 500),
};
