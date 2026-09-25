import { createTenantSchema, inviteSchema } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { HttpError, parseBody } from "../errors";
import { randomToken, issueSession } from "../lib/auth";
import { createTenantForUser } from "../lib/bootstrap";
import { publicCategories } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

export async function tenantRoutes(app: FastifyInstance) {
  app.get("/categories", async () => publicCategories());

  app.post("/tenants", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(createTenantSchema, request.body);
    const tenant = await createTenantForUser(request.auth!.userId, body);
    const session = await issueSession(request.auth!.userId, tenant.id);
    return { tenant, ...session };
  });

  app.get("/team", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const members = await prisma.membership.findMany({
      where: { tenantId: tenantId(request) },
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
      orderBy: { createdAt: "asc" },
    });
    const invites = await prisma.invite.findMany({
      where: { tenantId: tenantId(request), acceptedAt: null, expiresAt: { gt: new Date() } },
      include: { role: true },
    });
    return {
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        roleId: member.roleId,
        roleName: member.role.name,
        status: member.status,
      })),
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        roleName: invite.role.name,
        token: invite.token,
        expiresAt: invite.expiresAt,
      })),
    };
  });

  app.post("/team/invites", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const body = parseBody(inviteSchema, request.body);
    const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId: tenantId(request) } });
    if (!role) throw new HttpError(404, "Ruolo non trovato");
    const invite = await prisma.invite.create({
      data: {
        tenantId: tenantId(request),
        email: body.email.toLowerCase(),
        roleId: role.id,
        token: randomToken(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { id: invite.id, email: invite.email, token: invite.token, expiresAt: invite.expiresAt };
  });

  app.get("/roles", { preHandler: app.requireTenant }, async (request) => {
    return prisma.role.findMany({ where: { tenantId: tenantId(request) }, orderBy: { name: "asc" } });
  });
}
