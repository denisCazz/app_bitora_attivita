import { acceptInviteSchema, demoLoginSchema, INCLUDED_SEATS, loginSchema, pushTokenSchema, registerSchema, seatLimitMessage } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { HttpError, parseBody } from "../errors";
import { hashPassword, hashToken, issueSession, verifyPassword } from "../lib/auth";
import { manifestFor } from "../lib/manifest";
import { prisma } from "../lib/prisma";
import { tenantId } from "../plugins/auth";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request) => {
    const body = parseBody(registerSchema, request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw new HttpError(409, "Email già registrata");
    const user = await prisma.user.create({
      data: { email: body.email.toLowerCase(), name: body.name, passwordHash: await hashPassword(body.password) },
    });
    const session = await issueSession(user.id, null);
    return { ...session, user: { id: user.id, name: user.name, email: user.email }, needsOnboarding: true };
  });

  app.post("/auth/demo", async (request) => {
    const body = parseBody(demoLoginSchema, request.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new HttpError(404, "Demo non disponibile");
    const session = await issueSession(user.id, user.activeTenantId);
    return {
      ...session,
      user: { id: user.id, name: user.name, email: user.email, platformAdmin: false },
      activeTenantId: user.activeTenantId,
      needsOnboarding: !user.activeTenantId,
    };
  });

  app.post("/auth/login", async (request) => {
    const body = parseBody(loginSchema, request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Credenziali non valide");
    }
    const session = await issueSession(user.id, user.activeTenantId);
    const platformAdmin = user.platformAdmin && !user.email.endsWith(".demo");
    return {
      ...session,
      user: { id: user.id, name: user.name, email: user.email, platformAdmin },
      activeTenantId: user.activeTenantId,
      needsOnboarding: !user.activeTenantId && !platformAdmin,
    };
  });

  app.post("/auth/refresh", async (request) => {
    const token = (request.body as { refreshToken?: string })?.refreshToken;
    if (!token) throw new HttpError(400, "Refresh token mancante");
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.expiresAt < new Date()) throw new HttpError(401, "Sessione scaduta");
    await prisma.refreshToken.delete({ where: { id: row.id } });
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new HttpError(401, "Sessione scaduta");
    return issueSession(user.id, user.activeTenantId);
  });

  app.post("/auth/accept-invite", async (request) => {
    const body = parseBody(acceptInviteSchema, request.body);
    const user = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { token: body.token } });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw new HttpError(410, "Invito non valido");
      const email = invite.email.toLowerCase();
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) throw new HttpError(409, "Esiste già un account con questa email");
      const tenant = await tx.tenant.findUnique({ where: { id: invite.tenantId } });
      if (!tenant) throw new HttpError(410, "Invito non valido");
      const active = await tx.membership.count({ where: { tenantId: invite.tenantId, status: "ACTIVE" } });
      const pending = await tx.invite.count({
        where: { tenantId: invite.tenantId, acceptedAt: null, expiresAt: { gt: new Date() }, id: { not: invite.id } },
      });
      if (active + pending >= INCLUDED_SEATS + tenant.extraSeats) throw new HttpError(402, seatLimitMessage());
      const created = await tx.user.create({
        data: { email, name: body.name, passwordHash: await hashPassword(body.password), activeTenantId: invite.tenantId },
      });
      await tx.membership.create({
        data: { userId: created.id, tenantId: invite.tenantId, roleId: invite.roleId, status: "ACTIVE" },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return created;
    });
    const session = await issueSession(user.id, user.activeTenantId);
    return { ...session, user: { id: user.id, name: user.name, email: user.email }, needsOnboarding: false };
  });

  app.get("/me", { preHandler: app.requireUser }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new HttpError(404, "Utente non trovato");
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { tenant: true, role: true },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      platformAdmin: user.platformAdmin && !user.email.endsWith(".demo"),
      activeTenantId: user.activeTenantId,
      memberships: memberships.map((item) => ({
        tenantId: item.tenantId,
        tenantName: item.tenant.name,
        roleName: item.role.name,
      })),
    };
  });

  app.get("/me/manifest", { preHandler: app.requireTenant }, async (request) => {
    return manifestFor(request.auth!.userId, tenantId(request));
  });

  app.post("/me/tenant", { preHandler: app.requireUser }, async (request) => {
    const nextTenant = (request.body as { tenantId?: string })?.tenantId;
    if (!nextTenant) throw new HttpError(400, "Negozio mancante");
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: request.auth!.userId, tenantId: nextTenant } },
    });
    if (!membership || membership.status !== "ACTIVE") throw new HttpError(403, "Accesso negato");
    await prisma.user.update({ where: { id: request.auth!.userId }, data: { activeTenantId: nextTenant } });
    return issueSession(request.auth!.userId, nextTenant);
  });

  app.post("/me/push-token", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(pushTokenSchema, request.body);
    await prisma.pushToken.upsert({
      where: { userId_token: { userId: request.auth!.userId, token: body.token } },
      update: { platform: body.platform },
      create: { userId: request.auth!.userId, token: body.token, platform: body.platform },
    });
    return { ok: true };
  });

  app.get("/notifications", { preHandler: app.requireTenant }, async (request) => {
    return prisma.notification.findMany({
      where: { tenantId: tenantId(request), OR: [{ userId: request.auth!.userId }, { userId: null }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  app.post("/notifications/read", { preHandler: app.requireTenant }, async (request) => {
    await prisma.notification.updateMany({
      where: { tenantId: tenantId(request), readAt: null, OR: [{ userId: request.auth!.userId }, { userId: null }] },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.post("/notifications/:id/read", { preHandler: app.requireTenant }, async (request) => {
    const id = (request.params as { id: string }).id;
    const row = await prisma.notification.findFirst({
      where: { id, tenantId: tenantId(request), OR: [{ userId: request.auth!.userId }, { userId: null }] },
    });
    if (!row) throw new HttpError(404, "Notifica non trovata");
    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  });
}
