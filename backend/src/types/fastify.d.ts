import 'fastify';
import { authenticate, authorize, getOrganizationContext } from '../middleware/auth';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticate;
    authorize: typeof authorize;
    getOrganizationContext: typeof getOrganizationContext;
  }

  interface FastifyRequest {
    organizationId?: string;
    userRole?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string };
    user: { userId: string };
  }
}
