import { reminderSentSchema, reminderSettingsSchema } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { must, parseBody } from "../errors";
import {
  emailReminderNow,
  listReminders,
  markReminderSent,
  optOut,
  optOutPage,
  optOutPreview,
  publicReminderSettings,
  saveReminderSettings,
  tenantReminderSettings,
} from "../lib/customer-reminders";
import { payOrigin } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { publicPage } from "../lib/public-html";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

function idOf(request: { params: unknown }) {
  return (request.params as { id: string }).id;
}

function tokenOf(request: { params: unknown }) {
  return (request.params as { token: string }).token;
}

const INVALID = publicPage({ title: "Link non valido", body: `<div class="card"><p>Questo link non è valido o è stato copiato male.</p></div>` });

export async function reminderRoutes(app: FastifyInstance) {
  const manage = { preHandler: [app.requireTenant, permit("settings.manage")] };
  const read = { preHandler: [app.requireTenant, permit("schedules.read", "customers.read"), moduleGuard("calendar")] };
  const write = { preHandler: [app.requireTenant, permit("schedules.write", "customers.read"), moduleGuard("calendar")] };

  // Mail clients send one-click unsubscribes (RFC 8058) as a form post.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => done(null, body));

  app.get("/settings/reminders", manage, async (request) => {
    const tenant = await must(prisma.tenant.findUnique({ where: { id: tenantId(request) }, select: { reminderSettings: true } }), "Negozio");
    return publicReminderSettings(tenantReminderSettings(tenant.reminderSettings));
  });

  app.put("/settings/reminders", manage, async (request) => {
    const body = parseBody(reminderSettingsSchema, request.body);
    return saveReminderSettings(tenantId(request), { ...body, message: body.message ?? null });
  });

  app.get("/customer-reminders", read, async (request) => listReminders(tenantId(request)));

  app.post("/customer-reminders/:id/sent", write, async (request) => {
    const body = parseBody(reminderSentSchema, request.body);
    return markReminderSent(tenantId(request), idOf(request), body.channel);
  });

  app.post("/customer-reminders/:id/email", write, async (request) => emailReminderNow(tenantId(request), idOf(request), payOrigin(request.headers.host)));

  app.get("/r/stop/:token", async (request, reply) => {
    const preview = await optOutPreview(tokenOf(request));
    reply.type("text/html; charset=utf-8");
    if (!preview) return reply.code(404).send(INVALID);
    return optOutPage({ business: preview.business, token: tokenOf(request), stopped: preview.stopped });
  });

  app.post("/r/stop/:token", async (request, reply) => {
    const done = await optOut(tokenOf(request));
    reply.type("text/html; charset=utf-8");
    if (!done) return reply.code(404).send(INVALID);
    return optOutPage({ business: done.business, token: tokenOf(request), stopped: true });
  });
}
