import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';
import { hasRole } from '../utils/auth';

// Authentication middleware
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch (error) {
    logger.warn('Unauthorized access attempt');
    reply.code(401).send({
      success: false,
      error: {
        code: 'AUTH_MISSING',
        message: 'Authentication required',
      },
    });
  }
}

// Authorization middleware - check if user has required role
export function authorize(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    let userRole = (request.user as any)?.role;
    const userId = (request.user as any)?.userId;

    // If role is not in JWT, fetch it from database for backward compatibility
    if (!userRole && userId) {
      try {
        const prisma = (request.server as any).prisma;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });

        if (user) {
          userRole = user.role;
        }
      } catch (error) {
        logger.error('Error fetching user role:', error);
      }
    }

    if (!userRole) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions',
          details: 'User role not found',
        },
      });
    }

    if (!hasRole(userRole, allowedRoles)) {
      logger.warn(`Authorization failed for user ${userId} with role ${userRole}. Required roles: ${allowedRoles.join(', ')}`);
      return reply.code(403).send({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Insufficient permissions',
          details: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        },
      });
    }
  };
}

// Get organization context middleware
export async function getOrganizationContext(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request.user as any)?.userId;
  
  if (!userId) {
    return reply.code(401).send({
      success: false,
      error: {
        code: 'AUTH_MISSING',
        message: 'Authentication required',
      },
    });
  }

  // In a real app, you'd fetch user from DB and attach organization context
  // For now, we'll use a simplified approach
  const prisma = (request.server as any).prisma;
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      return reply.code(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Attach organization context to request
    (request as any).organizationId = user.organizationId;
    (request as any).userRole = user.role;
  } catch (error) {
    logger.error('Error getting organization context:', error);
    reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  }
}
