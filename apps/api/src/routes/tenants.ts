import { createTenantSchema, INCLUDED_SEATS, inviteSchema, memberRoleSchema, seatLimitMessage } from "@rapportini/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { HttpError, must, parseBody } from "../errors";
import { randomToken, issueSession } from "../lib/auth";
import { suggestActivity } from "../lib/assistant/setup";
import { createTenantForUser } from "../lib/bootstrap";
import { publicCategories, publicPlan } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { loadTeam } from "../lib/seats";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

export async function tenantRoutes(app: FastifyInstance) {
  app.get("/categories", async () => publicCategories());

  app.get("/categories/:id/plan", async (request) => publicPlan((request.params as { id: string }).id));

  app.post("/categories/:id/setup", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(z.object({ description: z.string().trim().min(8).max(600) }), request.body);
    return suggestActivity((request.params as { id: string }).id, body.description);
  });

  app.post("/tenants", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(createTenantSchema, request.body);
    const tenant = await createTenantForUser(request.auth!.userId, body);
    const session = await issueSession(request.auth!.userId, tenant.id);
    return { tenant, ...session };
  });

  app.get("/team", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    return loadTeam(tenantId(request), request.auth!.userId);
  });

  app.post("/team/invites", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const body = parseBody(inviteSchema, request.body);
    const id = tenantId(request);
    const email = body.email.toLowerCase();
    const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId: id } });
    if (!role) throw new HttpError(404, "Ruolo non trovato");
    if (role.isSystem) throw new HttpError(400, "Il titolare è uno solo");
    const already = await prisma.membership.findFirst({ where: { tenantId: id, user: { email } } });
    if (already) throw new HttpError(409, "Questa persona è già nel negozio");
    const invite = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      const active = await tx.membership.count({ where: { tenantId: id, status: "ACTIVE" } });
      const pending = await tx.invite.count({ where: { tenantId: id, acceptedAt: null, expiresAt: { gt: new Date() } } });
      if (!tenant || active + pending >= INCLUDED_SEATS + tenant.extraSeats) throw new HttpError(402, seatLimitMessage());
      const duplicate = await tx.invite.findFirst({ where: { tenantId: id, email, acceptedAt: null, expiresAt: { gt: new Date() } } });
      if (duplicate) throw new HttpError(409, "C'è già un invito per questa email");
      return tx.invite.create({
        data: {
          tenantId: id,
          email,
          roleId: role.id,
          token: randomToken(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });
    return { id: invite.id, email: invite.email, token: invite.token, expiresAt: invite.expiresAt };
  });

  app.delete("/team/invites/:id", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const id = tenantId(request);
    const invite = await must(prisma.invite.findFirst({ where: { id: idOf(request), tenantId: id, acceptedAt: null } }), "Invito");
    await prisma.invite.delete({ where: { id: invite.id } });
    return { ok: true };
  });

  app.patch("/team/members/:id", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const body = parseBody(memberRoleSchema, request.body);
    const id = tenantId(request);
    const member = await must(prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id } }), "Utente");
    const founding = await prisma.membership.findFirst({ where: { tenantId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (member.id === founding?.id) throw new HttpError(400, "Il titolare del negozio resta collegato");
    const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId: id } });
    if (!role) throw new HttpError(404, "Ruolo non trovato");
    if (role.isSystem) throw new HttpError(400, "Il titolare è uno solo");
    await prisma.membership.update({ where: { id: member.id }, data: { roleId: role.id } });
    return { ok: true };
  });

  app.post("/team/members/:id/reactivate", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const id = tenantId(request);
    const member = await must(prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id } }), "Utente");
    if (member.status === "ACTIVE") return { ok: true };
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      const active = await tx.membership.count({ where: { tenantId: id, status: "ACTIVE" } });
      const pending = await tx.invite.count({ where: { tenantId: id, acceptedAt: null, expiresAt: { gt: new Date() } } });
      if (!tenant || active + pending >= INCLUDED_SEATS + tenant.extraSeats) throw new HttpError(402, seatLimitMessage());
      await tx.membership.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
    });
    return { ok: true };
  });

  app.delete("/team/members/:id", { preHandler: [app.requireTenant, permit("team.manage")] }, async (request) => {
    const id = tenantId(request);
    const member = await must(
      prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id }, include: { user: true } }),
      "Utente",
    );
    const founding = await prisma.membership.findFirst({ where: { tenantId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (member.id === founding?.id) throw new HttpError(400, "Il titolare del negozio resta collegato");
    if (member.userId === request.auth!.userId) throw new HttpError(400, "Non puoi togliere il tuo accesso da qui");
    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: member.id } });
      if (member.user.activeTenantId === id) {
        const next = await tx.membership.findFirst({
          where: { userId: member.userId, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
        });
        await tx.user.update({ where: { id: member.userId }, data: { activeTenantId: next?.tenantId ?? null } });
      }
    });
    return { ok: true };
  });

  app.get("/roles", { preHandler: app.requireTenant }, async (request) => {
    return prisma.role.findMany({ where: { tenantId: tenantId(request) }, orderBy: { name: "asc" } });
  });
}
