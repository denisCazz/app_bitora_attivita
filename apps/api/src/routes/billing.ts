import { checkoutSchema, isModuleKey, trialSchema, type ModuleKey } from "@rapportini/shared";
import { categoryOfTenant } from "../lib/catalog";
import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { HttpError, must, parseBody } from "../errors";
import { prisma } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

const SIGNATURE_TOLERANCE_SECONDS = 300;

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new HttpError(502, data.error?.message ?? "Pagamento non disponibile");
  return data;
}

function verifyStripeSignature(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.split("=") as [string, string]);
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw.toString("utf8")}`).digest("hex"));
  return signatures.some((signature) => {
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

async function licenseModules(tenant: string, keys: ModuleKey[], subscriptionId: string | null) {
  for (const moduleKey of keys) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId: tenant, moduleKey } },
      create: { tenantId: tenant, moduleKey, enabled: true, licensed: true, stripeSubscriptionId: subscriptionId },
      update: { enabled: true, licensed: true, stripeSubscriptionId: subscriptionId },
    });
  }
}

async function paidModulesFor(tenant: string, keys: ModuleKey[]) {
  const record = await must(prisma.tenant.findUnique({ where: { id: tenant } }), "Negozio");
  const category = await categoryOfTenant(tenant);
  const modules = [...new Set(keys)].map((key) => {
    const definition = category.modules.find((module) => module.key === key);
    if (!definition) throw new HttpError(400, "Modulo non disponibile per la tua categoria");
    if (definition.free || definition.priceCents === 0) throw new HttpError(400, `${definition.label} è già incluso gratis`);
    return definition;
  });
  return { record, modules };
}

export async function billingRoutes(app: FastifyInstance) {
  const manage = [app.requireTenant, permit("settings.manage")];

  app.post("/billing/trial", { preHandler: manage }, async (request) => {
    const { moduleKey } = parseBody(trialSchema, request.body);
    const id = tenantId(request);
    const [definition] = (await paidModulesFor(id, [moduleKey])).modules;
    if (!definition?.trialDays) throw new HttpError(400, "Questo modulo non ha una prova gratuita");
    const row = await prisma.tenantModule.findUnique({ where: { tenantId_moduleKey: { tenantId: id, moduleKey } } });
    if (row?.licensed) throw new HttpError(409, "Modulo già attivo");
    if (row?.trialEndsAt) throw new HttpError(409, "Hai già provato questo modulo");
    const trialEndsAt = new Date(Date.now() + definition.trialDays * 24 * 60 * 60 * 1000);
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId: id, moduleKey } },
      create: { tenantId: id, moduleKey, enabled: true, trialEndsAt },
      update: { enabled: true, trialEndsAt },
    });
    return { moduleKey, trialEndsAt };
  });

  app.post("/billing/checkout", { preHandler: manage }, async (request) => {
    const body = parseBody(checkoutSchema, request.body);
    const id = tenantId(request);
    const { record, modules } = await paidModulesFor(id, body.moduleKeys);
    const keys = modules.map((module) => module.key);

    if (!env.stripeSecretKey) {
      if (!env.billingDemo) throw new HttpError(503, "Pagamenti non ancora configurati");
      await licenseModules(id, keys, null);
      return { mode: "demo" as const };
    }

    let customerId = record.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe<{ id: string }>("customers", { name: record.name, "metadata[tenantId]": id });
      customerId = customer.id;
      await prisma.tenant.update({ where: { id }, data: { stripeCustomerId: customerId } });
    }

    const params: Record<string, string> = {
      mode: "subscription",
      customer: customerId,
      success_url: `${env.publicBaseUrl}/billing/done?status=ok`,
      cancel_url: `${env.publicBaseUrl}/billing/done?status=cancel`,
      "metadata[tenantId]": id,
      "metadata[moduleKeys]": keys.join(","),
      "subscription_data[metadata][tenantId]": id,
      "subscription_data[metadata][moduleKeys]": keys.join(","),
    };
    modules.forEach((module, index) => {
      params[`line_items[${index}][quantity]`] = "1";
      params[`line_items[${index}][price_data][currency]`] = "eur";
      params[`line_items[${index}][price_data][unit_amount]`] = String(module.priceCents);
      params[`line_items[${index}][price_data][recurring][interval]`] = "month";
      params[`line_items[${index}][price_data][product_data][name]`] = `Bitora · ${module.label}`;
    });
    const session = await stripe<{ url: string }>("checkout/sessions", params);
    return { mode: "stripe" as const, url: session.url };
  });

  app.get("/billing/done", async (request, reply) => {
    const ok = (request.query as { status?: string }).status === "ok";
    reply.type("text/html; charset=utf-8");
    return `<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bitora</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,system-ui,sans-serif;background:#0E0F12;color:#fff;text-align:center">
<div><h1 style="font-weight:600">${ok ? "Modulo sbloccato" : "Pagamento annullato"}</h1>
<p style="opacity:.7">${ok ? "Torna in Bitora: il modulo sarà attivo tra pochi secondi." : "Nessun addebito. Puoi tornare in Bitora."}</p></div></body></html>`;
  });

  await app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

    hook.post("/billing/webhook", async (request, reply) => {
      if (!env.stripeWebhookSecret) return reply.code(503).send({ error: "Webhook non configurato" });
      const raw = request.body as Buffer;
      if (!verifyStripeSignature(raw, request.headers["stripe-signature"] as string | undefined, env.stripeWebhookSecret)) {
        return reply.code(400).send({ error: "Firma non valida" });
      }
      const event = JSON.parse(raw.toString("utf8")) as {
        type: string;
        data: { object: { id: string; subscription?: string; metadata?: Record<string, string> } };
      };
      const object = event.data.object;

      if (event.type === "checkout.session.completed" && object.metadata?.tenantId) {
        const tenant = await prisma.tenant.findUnique({ where: { id: object.metadata.tenantId } });
        if (tenant) {
          const available = new Set((await categoryOfTenant(tenant.id)).modules.map((module) => module.key));
          const keys = (object.metadata.moduleKeys ?? "").split(",").filter((key): key is ModuleKey => isModuleKey(key) && available.has(key));
          await licenseModules(tenant.id, keys, object.subscription ?? null);
        }
      }

      if (event.type === "customer.subscription.deleted") {
        await prisma.tenantModule.updateMany({
          where: { stripeSubscriptionId: object.id },
          data: { licensed: false, stripeSubscriptionId: null },
        });
      }

      return { received: true };
    });
  });
}
