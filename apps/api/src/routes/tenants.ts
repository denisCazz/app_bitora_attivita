import {
  createTenantSchema,
  employeePasswordSchema,
  employeeSchema,
  INCLUDED_SEATS,
  inviteSchema,
  memberRoleSchema,
  PERMISSIONS,
  seatLimitMessage,
} from "@rapportini/shared";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { HttpError, must, parseBody } from "../errors";
import { hashPassword, randomToken, issueSession } from "../lib/auth";
import { suggestActivity } from "../lib/assistant/setup";
import { createTenantForUser } from "../lib/bootstrap";
import { publicCategories, publicPlan } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { loadTeam } from "../lib/seats";
import { canManagePeople, foundingMembership, isPlatformAdmin } from "../lib/team";
import { tenantId } from "../plugins/auth";
import { permit, requireOwner } from "../plugins/guards";

const ADMIN_ROLE = "Amministratore";

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

async function assertSeat(tx: Prisma.TransactionClient, tenantId: string) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
  const active = await tx.membership.count({ where: { tenantId, status: "ACTIVE" } });
  const pending = await tx.invite.count({ where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } } });
  if (!tenant || active + pending >= INCLUDED_SEATS + tenant.extraSeats) throw new HttpError(402, seatLimitMessage());
}

async function adminRole(tx: Prisma.TransactionClient, tenantId: string) {
  const existing = await tx.role.findFirst({ where: { tenantId, name: ADMIN_ROLE } });
  if (existing) return existing;
  return tx.role.create({ data: { tenantId, name: ADMIN_ROLE, permissions: [...PERMISSIONS], isSystem: false } });
}

export async function tenantRoutes(app: FastifyInstance) {
  const owner = [app.requireTenant, requireOwner];

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
    const id = tenantId(request);
    const [team, manage] = await Promise.all([loadTeam(id, request.auth!.userId), canManagePeople(id, request.auth!.userId)]);
    return { ...team, canManage: manage };
  });

  app.post("/team/members", { preHandler: owner }, async (request) => {
    const body = parseBody(employeeSchema, request.body);
    const id = tenantId(request);
    const email = body.email.toLowerCase();
    if (email.endsWith(".demo")) throw new HttpError(400, "Usa un'email vera");
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, "Esiste già un account con questa email: usa un'altra email");
    }
    const passwordHash = await hashPassword(body.password);
    const member = await prisma.$transaction(async (tx) => {
      const role = body.access === "admin" ? await adminRole(tx, id) : await tx.role.findFirst({ where: { id: body.roleId, tenantId: id } });
      if (!role) throw new HttpError(404, "Ruolo non trovato");
      if (role.isSystem) throw new HttpError(400, "Il titolare è uno solo");
      await assertSeat(tx, id);
      const user = await tx.user.create({ data: { email, name: body.name, passwordHash, activeTenantId: id } });
      return tx.membership.create({ data: { userId: user.id, tenantId: id, roleId: role.id, status: "ACTIVE" }, include: { role: true } });
    });
    return { id: member.id, userId: member.userId, name: body.name, email, roleName: member.role.name };
  });

  app.post("/team/members/:id/password", { preHandler: owner }, async (request) => {
    const body = parseBody(employeePasswordSchema, request.body);
    const id = tenantId(request);
    const member = await must(prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id }, include: { user: true } }), "Utente");
    const founding = await foundingMembership(id);
    if (member.id === founding?.id || member.userId === request.auth!.userId) throw new HttpError(400, "La tua password la cambi dal Profilo");
    const elsewhere = await prisma.membership.count({ where: { userId: member.userId, tenantId: { not: id } } });
    if (elsewhere || isPlatformAdmin(member.user)) throw new HttpError(403, "Questa persona usa l'account anche altrove: la password la cambia lei dal Profilo");
    await prisma.$transaction([
      prisma.user.update({ where: { id: member.userId }, data: { passwordHash: await hashPassword(body.password) } }),
      prisma.refreshToken.deleteMany({ where: { userId: member.userId } }),
    ]);
    return { ok: true };
  });

  app.post("/team/invites", { preHandler: owner }, async (request) => {
    const body = parseBody(inviteSchema, request.body);
    const id = tenantId(request);
    const email = body.email.toLowerCase();
    const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId: id } });
    if (!role) throw new HttpError(404, "Ruolo non trovato");
    if (role.isSystem) throw new HttpError(400, "Il titolare è uno solo");
    const already = await prisma.membership.findFirst({ where: { tenantId: id, user: { email } } });
    if (already) throw new HttpError(409, "Questa persona è già nel negozio");
    const invite = await prisma.$transaction(async (tx) => {
      await assertSeat(tx, id);
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

  app.delete("/team/invites/:id", { preHandler: owner }, async (request) => {
    const id = tenantId(request);
    const invite = await must(prisma.invite.findFirst({ where: { id: idOf(request), tenantId: id, acceptedAt: null } }), "Invito");
    await prisma.invite.delete({ where: { id: invite.id } });
    return { ok: true };
  });

  app.patch("/team/members/:id", { preHandler: owner }, async (request) => {
    const body = parseBody(memberRoleSchema, request.body);
    const id = tenantId(request);
    const member = await must(prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id } }), "Utente");
    const founding = await foundingMembership(id);
    if (member.id === founding?.id) throw new HttpError(400, "Il titolare del negozio resta collegato");
    const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId: id } });
    if (!role) throw new HttpError(404, "Ruolo non trovato");
    if (role.isSystem) throw new HttpError(400, "Il titolare è uno solo");
    await prisma.membership.update({ where: { id: member.id }, data: { roleId: role.id } });
    return { ok: true };
  });

  app.post("/team/members/:id/reactivate", { preHandler: owner }, async (request) => {
    const id = tenantId(request);
    const member = await must(prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id } }), "Utente");
    if (member.status === "ACTIVE") return { ok: true };
    await prisma.$transaction(async (tx) => {
      await assertSeat(tx, id);
      await tx.membership.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
    });
    return { ok: true };
  });

  app.delete("/team/members/:id", { preHandler: owner }, async (request) => {
    const id = tenantId(request);
    const member = await must(
      prisma.membership.findFirst({ where: { id: idOf(request), tenantId: id }, include: { user: true } }),
      "Utente",
    );
    const founding = await foundingMembership(id);
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
