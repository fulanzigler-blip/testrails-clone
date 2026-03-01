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
    cookies?: Record<string, string>;
  }

  interface FastifyReply {
    setCookie: (name: string, value: string, options?: any) => FastifyReply;
    clearCookie: (name: string) => FastifyReply;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; emailVerified?: boolean; role?: string; type?: string };
    user: { userId: string; emailVerified?: boolean; role?: string; type?: string };
  }
}
