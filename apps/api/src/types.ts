export interface AuthContext {
  userId: string;
  tenantId: string | null;
  roleId: string | null;
  permissions: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    requireUser: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
    requireTenant: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
}
