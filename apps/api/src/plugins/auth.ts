import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "../errors";
import { verifyAccess } from "../lib/auth";
import { prisma } from "../lib/prisma";

async function loadAuth(request: FastifyRequest, reply: FastifyReply, needTenant: boolean) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Non autenticato" });
    return;
  }
  try {
    const payload = await verifyAccess(header.slice(7));
    if (!needTenant) {
      request.auth = { userId: payload.sub, tenantId: payload.tenantId ?? null, roleId: null, permissions: [] };
    }
    if (!payload.tenantId) {
      if (needTenant) reply.code(409).send({ error: "Completa la configurazione del negozio" });
      else request.auth = { userId: payload.sub, tenantId: null, roleId: null, permissions: [] };
      return;
    }
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: payload.sub, tenantId: payload.tenantId } },
      include: { role: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      reply.code(403).send({ error: "Accesso negato" });
      return;
    }
    request.auth = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      roleId: membership.roleId,
      permissions: membership.role.permissions,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    reply.code(401).send({ error: "Sessione scaduta" });
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate("requireUser", async (request: FastifyRequest, reply: FastifyReply) => {
    await loadAuth(request, reply, false);
  });
  app.decorate("requireTenant", async (request: FastifyRequest, reply: FastifyReply) => {
    await loadAuth(request, reply, true);
  });
}

export function tenantId(request: FastifyRequest): string {
  const id = request.auth?.tenantId;
  if (!id) throw new HttpError(409, "Negozio non selezionato");
  return id;
}
