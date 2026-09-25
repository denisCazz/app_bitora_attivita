import { moduleStatus, type ModuleKey, type Permission } from "@rapportini/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { categoryOfTenant } from "../lib/catalog";
import { prisma } from "../lib/prisma";

export function permit(...permissions: Permission[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const owned = request.auth?.permissions ?? [];
    if (!permissions.every((permission) => owned.includes(permission))) {
      reply.code(403).send({ error: "Permesso negato" });
    }
  };
}

export function moduleGuard(key: ModuleKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenantId;
    if (!tenantId) return;
    const [category, row] = await Promise.all([
      categoryOfTenant(tenantId),
      prisma.tenantModule.findUnique({ where: { tenantId_moduleKey: { tenantId, moduleKey: key } } }),
    ]);
    const definition = category.modules.find((module) => module.key === key);
    if (!definition) {
      reply.code(404).send({ error: "Modulo non attivo" });
      return;
    }
    const status = moduleStatus(
      definition.free,
      row ? { key, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt } : undefined,
    );
    if (status === "locked") reply.code(402).send({ error: "Modulo non incluso nel tuo piano", module: key });
    else if (status === "off") reply.code(404).send({ error: "Modulo non attivo" });
  };
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.auth?.userId;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { platformAdmin: true, email: true } }) : null;
  if (!user?.platformAdmin || user.email.endsWith(".demo")) reply.code(403).send({ error: "Solo per il team Bitora" });
}
