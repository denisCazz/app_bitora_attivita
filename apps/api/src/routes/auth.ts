import {
  acceptInviteSchema,
  aiConsentSchema,
  deleteAccountByEmailSchema,
  deleteAccountSchema,
  demoLoginSchema,
  INCLUDED_SEATS,
  LEGAL_VERSION,
  loginSchema,
  logoutSchema,
  passwordChangeSchema,
  profileSchema,
  pushTokenSchema,
  registerSchema,
  seatLimitMessage,
  socialLoginSchema,
  termsAcceptSchema,
} from "@rapportini/shared";
import type { User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { env } from "../env";
import { HttpError, parseBody } from "../errors";
import { deleteAccount, exportAccount, isDemoEmail, ownedTenants } from "../lib/account";
import { hashPassword, hashToken, issueSession, signPurpose, verifyPassword, verifyPurpose } from "../lib/auth";
import { prepareDemoTenant } from "../lib/demo";
import { manifestFor } from "../lib/manifest";
import { prisma } from "../lib/prisma";
import { appleRefreshToken, verifyIdentity } from "../lib/social";
import { tenantId } from "../plugins/auth";

async function signedIn(user: User) {
  if (user.activeTenantId && isDemoEmail(user.email)) await prepareDemoTenant(user.activeTenantId);
  const session = await issueSession(user.id, user.activeTenantId);
  const platformAdmin = user.platformAdmin && !user.email.endsWith(".demo");
  return {
    ...session,
    user: { id: user.id, name: user.name, email: user.email, platformAdmin },
    activeTenantId: user.activeTenantId,
    needsOnboarding: !user.activeTenantId && !platformAdmin,
  };
}

const DELETE_PAGE = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elimina account · Bitora</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,system-ui,sans-serif;background:#0E0F12;color:#fff">
<main style="max-width:420px;padding:24px">
<h1 style="font-weight:600">Elimina il tuo account Bitora</h1>
<p style="opacity:.75">Puoi farlo anche dall'app: <b>Altro › Profilo › Elimina account</b>. Prima puoi scaricare i tuoi dati da <b>Profilo › Scarica i miei dati</b>. Se accedi con Apple o Google e non hai impostato una password, eliminalo dall'app. Dettagli nell'<a href="/legal/privacy" style="color:#F5B971">Informativa privacy</a>.</p>
<p style="opacity:.75">Vengono cancellati subito e in modo definitivo: il tuo profilo, gli accessi, i turni e le notifiche.
Se sei titolare di un negozio, viene eliminato anche il negozio con tutti i suoi dati (clienti, schede, foto, magazzino) e gli abbonamenti vengono disdetti senza altri addebiti.
Le fatture già emesse restano conservate da Stripe per gli obblighi fiscali.</p>
<form id="f" style="display:grid;gap:12px">
<input name="email" type="email" placeholder="Email" required autocomplete="email" style="padding:14px;border-radius:12px;border:1px solid #333;background:#16181d;color:#fff;font-size:16px">
<input name="password" type="password" placeholder="Password" required autocomplete="current-password" style="padding:14px;border-radius:12px;border:1px solid #333;background:#16181d;color:#fff;font-size:16px">
<label style="display:flex;gap:8px;opacity:.85"><input type="checkbox" required> Ho capito che l'operazione non si può annullare</label>
<button style="padding:14px;border-radius:12px;border:0;background:#E5484D;color:#fff;font-weight:700;font-size:16px">Elimina definitivamente</button>
<p id="m" role="status" style="min-height:1.2em"></p>
</form></main>
<script>
document.getElementById("f").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const message = document.getElementById("m");
  message.textContent = "Elimino…";
  const response = await fetch("/auth/delete-account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.ok) {
    event.target.replaceChildren(Object.assign(document.createElement("p"), { textContent: "Account eliminato. Ci dispiace vederti andare." }));
  } else {
    message.textContent = body.error || "Non è stato possibile eliminare l'account";
  }
});
</script></body></html>`;

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request) => {
    const body = parseBody(registerSchema, request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw new HttpError(409, "Email già registrata");
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash: await hashPassword(body.password),
        termsVersion: LEGAL_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    const session = await issueSession(user.id, null);
    return { ...session, user: { id: user.id, name: user.name, email: user.email }, needsOnboarding: true };
  });

  app.post("/auth/demo", async (request) => {
    const body = parseBody(demoLoginSchema, request.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new HttpError(404, "Demo non disponibile");
    if (user.activeTenantId) await prepareDemoTenant(user.activeTenantId);
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
    if (user && !user.passwordHash && (user.appleSub || user.googleSub)) {
      throw new HttpError(401, `Questo account usa l'accesso con ${user.appleSub ? "Apple" : "Google"}`);
    }
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Credenziali non valide");
    }
    return signedIn(user);
  });

  app.post("/auth/social", async (request) => {
    const body = parseBody(socialLoginSchema, request.body);
    const identity = await verifyIdentity(body.provider, body.idToken);
    const link = identity.provider === "apple" ? { appleSub: identity.sub } : { googleSub: identity.sub };
    const label = identity.provider === "apple" ? "Apple" : "Google";

    let user = await prisma.user.findUnique({ where: link });
    if (!user) {
      if (!identity.email) throw new HttpError(400, `${label} non ha condiviso l'email: riprova consentendo l'accesso all'indirizzo`);
      const existing = await prisma.user.findUnique({ where: { email: identity.email } });
      if (existing) {
        if (!identity.emailVerified) throw new HttpError(409, `Esiste già un account con questa email: accedi con la password`);
        if (isDemoEmail(existing.email)) throw new HttpError(403, "Gli account demo non si collegano");
        if ((identity.provider === "apple" ? existing.appleSub : existing.googleSub) !== null) {
          throw new HttpError(409, `Questa email è già collegata a un altro account ${label}`);
        }
        user = await prisma.user.update({ where: { id: existing.id }, data: link });
      } else {
        const accepted = Boolean(body.acceptTerms && body.approveClauses);
        user = await prisma.user.create({
          data: {
            ...link,
            email: identity.email,
            name: body.name || identity.name || identity.email.split("@")[0]!,
            termsVersion: accepted ? LEGAL_VERSION : null,
            termsAcceptedAt: accepted ? new Date() : null,
          },
        });
      }
    }

    if (identity.provider === "apple" && body.authorizationCode) {
      const refreshToken = await appleRefreshToken(body.authorizationCode);
      if (refreshToken) user = await prisma.user.update({ where: { id: user.id }, data: { appleRefreshToken: refreshToken } });
    }
    return signedIn(user);
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
        data: {
          email,
          name: body.name,
          passwordHash: await hashPassword(body.password),
          activeTenantId: invite.tenantId,
          termsVersion: LEGAL_VERSION,
          termsAcceptedAt: new Date(),
        },
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
    const [memberships, owned] = await Promise.all([
      prisma.membership.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { tenant: true, role: true },
      }),
      ownedTenants(user.id),
    ]);
    const ownedIds = new Set(owned.map((tenant) => tenant.id));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      demo: isDemoEmail(user.email),
      hasPassword: Boolean(user.passwordHash),
      signInWith: [user.appleSub ? "apple" : null, user.googleSub ? "google" : null].filter(Boolean),
      platformAdmin: user.platformAdmin && !user.email.endsWith(".demo"),
      activeTenantId: user.activeTenantId,
      memberships: memberships.map((item) => ({
        tenantId: item.tenantId,
        tenantName: item.tenant.name,
        roleName: item.role.name,
        owner: ownedIds.has(item.tenantId),
      })),
      ownedTenants: owned.map((tenant) => ({ id: tenant.id, name: tenant.name, otherMembers: tenant.otherMembers })),
      legalVersion: LEGAL_VERSION,
      termsAcceptedAt: user.termsAcceptedAt,
      needsTerms: !isDemoEmail(user.email) && user.termsVersion !== LEGAL_VERSION,
      aiConsentAt: isDemoEmail(user.email) ? null : user.aiConsentAt,
    };
  });

  app.post("/me/terms", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(termsAcceptSchema, request.body);
    if (body.version !== LEGAL_VERSION) throw new HttpError(409, "I documenti sono stati aggiornati: ricarica e rileggili");
    await prisma.user.update({ where: { id: request.auth!.userId }, data: { termsVersion: LEGAL_VERSION, termsAcceptedAt: new Date() } });
    return { ok: true };
  });

  app.post("/me/ai-consent", { preHandler: app.requireUser }, async (request) => {
    const { granted } = parseBody(aiConsentSchema, request.body);
    const aiConsentAt = granted ? new Date() : null;
    await prisma.user.updateMany({ where: { id: request.auth!.userId, NOT: { email: { endsWith: ".demo" } } }, data: { aiConsentAt } });
    return { aiConsentAt };
  });

  app.post("/me/export-link", { preHandler: app.requireUser }, async (request) => {
    const token = await signPurpose(request.auth!.userId, "export", "10m");
    return { url: `${env.publicBaseUrl}/me/export?token=${token}`, expiresInMinutes: 10 };
  });

  app.get("/me/export", async (request, reply) => {
    const userId = await verifyPurpose(String((request.query as { token?: string }).token ?? ""), "export");
    if (!userId) throw new HttpError(410, "Link scaduto: richiedine uno nuovo dall'app");
    const data = await exportAccount(userId);
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="bitora-dati-${stamp}.json"`);
    reply.header("cache-control", "no-store");
    return reply.send(JSON.stringify(data, null, 2));
  });

  app.patch("/me", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(profileSchema, request.body);
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new HttpError(404, "Utente non trovato");
    if (isDemoEmail(user.email)) throw new HttpError(403, "Il profilo demo non si modifica");
    const email = body.email.toLowerCase();
    if (email !== user.email) {
      if (user.passwordHash && !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw new HttpError(401, "Per cambiare email inserisci la password attuale");
      }
      const taken = await prisma.user.findUnique({ where: { email } });
      if (taken) throw new HttpError(409, "Email già registrata");
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { name: body.name, email } });
    return { id: updated.id, name: updated.name, email: updated.email };
  });

  app.post("/me/password", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(passwordChangeSchema, request.body);
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new HttpError(404, "Utente non trovato");
    if (isDemoEmail(user.email)) throw new HttpError(403, "La password demo non si modifica");
    if (user.passwordHash && !(await verifyPassword(body.currentPassword, user.passwordHash))) throw new HttpError(401, "Password attuale non corretta");
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
    return issueSession(user.id, request.auth!.tenantId);
  });

  app.post("/auth/logout", async (request) => {
    const body = parseBody(logoutSchema, request.body ?? {});
    if (!body.refreshToken) return { ok: true };
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(body.refreshToken) } });
    if (!row) return { ok: true };
    await prisma.refreshToken.delete({ where: { id: row.id } });
    if (body.pushToken) await prisma.pushToken.deleteMany({ where: { userId: row.userId, token: body.pushToken } });
    return { ok: true };
  });

  app.delete("/me", { preHandler: app.requireUser }, async (request) => {
    const body = parseBody(deleteAccountSchema, request.body);
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) throw new HttpError(404, "Utente non trovato");
    if (user.passwordHash && !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, "Password non corretta");
    return deleteAccount(user.id);
  });

  app.post("/auth/delete-account", async (request) => {
    const body = parseBody(deleteAccountByEmailSchema, request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, "Credenziali non valide");
    return deleteAccount(user.id);
  });

  app.get("/account/delete", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return DELETE_PAGE;
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
