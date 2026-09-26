import { checkoutSchema, isDemoEmail, isModuleKey, seatsSchema, storePurchaseSchema, storeSyncSchema, trialSchema, type ModuleKey } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { categoryOfTenant } from "../lib/catalog";
import { env } from "../env";
import { HttpError, must, parseBody } from "../errors";
import { prisma } from "../lib/prisma";
import { applyExtraSeats } from "../lib/seats";
import { applyStoreRecord, verifyAppleNotification, verifyAppleTransaction, verifyGooglePurchase } from "../lib/store-billing";
import { ensureModulePrice, extraSeatPriceId, integrationIdentifier, isStripeMissing, stripeClient, stripeMessage } from "../lib/stripe";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

async function licenseModules(tenant: string, keys: ModuleKey[], subscriptionId: string | null) {
  const billingSource = subscriptionId ? ("STRIPE" as const) : ("DEMO" as const);
  for (const moduleKey of keys) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId: tenant, moduleKey } },
      create: { tenantId: tenant, moduleKey, enabled: true, licensed: true, billingSource, stripeSubscriptionId: subscriptionId },
      update: { enabled: true, licensed: true, billingSource, licenseExpiresAt: null, stripeSubscriptionId: subscriptionId },
    });
  }
}

async function verifyStorePurchase(purchase: { platform: "ios" | "android"; purchaseToken: string; productId: string }) {
  const record = purchase.platform === "ios" ? await verifyAppleTransaction(purchase.purchaseToken) : await verifyGooglePurchase(purchase.purchaseToken);
  if (record.productId !== purchase.productId) throw new HttpError(400, "La ricevuta non corrisponde al prodotto");
  return record;
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

async function priceFor(module: { key: string; label: string; description: string; priceCents: number }) {
  const stripe = stripeClient();
  if (!stripe) return null;
  const row = await prisma.moduleDef.findUnique({ where: { key: module.key }, select: { stripePriceId: true } });
  if (row?.stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(row.stripePriceId);
      if (price.active && price.unit_amount === module.priceCents && price.currency === "eur") return price.id;
    } catch (error) {
      if (!isStripeMissing(error)) throw error;
    }
  }
  return ensureModulePrice(module);
}

async function customerFor(stripe: Stripe, tenantId: string, name: string, userId: string | undefined, existing: string | null) {
  if (existing) return existing;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }) : null;
  const customer = await stripe.customers.create({ name, email: user?.email, metadata: { tenantId } });
  await prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

async function changeSeatQuantity(stripe: Stripe, subscriptionId: string, extraSeats: number, price: string) {
  if (extraSeats === 0) {
    await stripe.subscriptions.cancel(subscriptionId);
    return;
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data.find((row) => row.price.id === price) ?? subscription.items.data[0];
  if (!item) throw new HttpError(502, "Abbonamento utenti non trovato");
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, price, quantity: extraSeats }],
    proration_behavior: extraSeats > (item.quantity ?? 0) ? "always_invoice" : "create_prorations",
    payment_behavior: "error_if_incomplete",
  });
}

function subscriptionId(session: Stripe.Checkout.Session) {
  return typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
}

const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

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
    const owned = await prisma.tenantModule.findMany({ where: { tenantId: id, moduleKey: { in: keys }, licensed: true } });
    if (owned.some((row) => !row.licenseExpiresAt || row.licenseExpiresAt > new Date())) throw new HttpError(409, "Modulo già attivo");
    const stripe = stripeClient();

    if (!stripe) {
      const user = request.auth?.userId ? await prisma.user.findUnique({ where: { id: request.auth.userId }, select: { email: true } }) : null;
      if (!env.billingDemo || isDemoEmail(user?.email ?? "")) throw new HttpError(503, "Pagamenti con carta non configurati: imposta le chiavi Stripe (anche di test) per provare l'acquisto");
      await licenseModules(id, keys, null);
      return { mode: "demo" as const };
    }

    const customerId = await customerFor(stripe, id, record.name, request.auth?.userId, record.stripeCustomerId);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    for (const module of modules) {
      const price = await priceFor(module);
      if (!price) throw new HttpError(503, "Prezzo non configurato");
      lineItems.push({ price, quantity: 1 });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: id,
        success_url: `${env.publicBaseUrl}/billing/done?status=ok`,
        cancel_url: `${env.publicBaseUrl}/billing/done?status=cancel`,
        metadata: { tenantId: id, moduleKeys: keys.join(",") },
        subscription_data: {
          billing_mode: { type: "flexible" },
          metadata: { tenantId: id, moduleKeys: keys.join(",") },
        },
        line_items: lineItems,
        integration_identifier: integrationIdentifier("modules"),
      });
      if (!session.url) throw new HttpError(502, "Pagamento non disponibile");
      return { mode: "stripe" as const, url: session.url };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.get("/billing/store/account", { preHandler: manage }, async (request) => {
    const record = await must(prisma.tenant.findUnique({ where: { id: tenantId(request) }, select: { storeAccountToken: true } }), "Negozio");
    return { accountToken: record.storeAccountToken };
  });

  app.post("/billing/store/verify", { preHandler: manage }, async (request) => {
    const purchase = parseBody(storePurchaseSchema, request.body);
    return applyStoreRecord(await verifyStorePurchase(purchase), tenantId(request));
  });

  app.post("/billing/store/sync", { preHandler: manage }, async (request) => {
    const { purchases } = parseBody(storeSyncSchema, request.body);
    const id = tenantId(request);
    const results = [];
    for (const purchase of purchases) {
      try {
        const applied = await applyStoreRecord(await verifyStorePurchase(purchase), id);
        results.push({ productId: purchase.productId, ok: true as const, active: applied.active });
      } catch (error) {
        results.push({ productId: purchase.productId, ok: false as const, error: error instanceof Error ? error.message : "Errore" });
      }
    }
    return { results };
  });

  app.post("/billing/apple/notifications", async (request, reply) => {
    const signedPayload = (request.body as { signedPayload?: unknown } | undefined)?.signedPayload;
    if (typeof signedPayload !== "string") return reply.code(400).send({ error: "Notifica non valida" });
    let verified: Awaited<ReturnType<typeof verifyAppleNotification>>;
    try {
      verified = await verifyAppleNotification(signedPayload);
    } catch {
      return reply.code(400).send({ error: "Firma non valida" });
    }
    if (verified.record) {
      await applyStoreRecord(verified.record).catch((error: unknown) => request.log.warn({ error, type: verified.notification.notificationType }, "Notifica App Store non applicata"));
    }
    return { received: true };
  });

  app.post("/billing/google/notifications", async (request) => {
    const encoded = (request.body as { message?: { data?: unknown } } | undefined)?.message?.data;
    if (typeof encoded !== "string") return { received: true };
    let message: { packageName?: string; subscriptionNotification?: { purchaseToken?: string }; voidedPurchaseNotification?: { purchaseToken?: string } };
    try {
      message = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    } catch {
      return { received: true };
    }
    const token = message.subscriptionNotification?.purchaseToken ?? message.voidedPurchaseNotification?.purchaseToken;
    if (message.packageName === env.google.packageName && token) {
      try {
        await applyStoreRecord(await verifyGooglePurchase(token));
      } catch (error) {
        request.log.warn({ error }, "Notifica Google Play non applicata");
      }
    }
    return { received: true };
  });

  app.post("/billing/seats", { preHandler: manage }, async (request) => {
    const { extraSeats } = parseBody(seatsSchema, request.body);
    const id = tenantId(request);
    const record = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    if (extraSeats === record.extraSeats) return { mode: "updated" as const, extraSeats };
    const stripe = stripeClient();

    if (!stripe) {
      if (!env.billingDemo) throw new HttpError(503, "Pagamenti non ancora configurati");
      await applyExtraSeats(id, extraSeats, null);
      return { mode: "demo" as const, extraSeats };
    }

    try {
      const price = await extraSeatPriceId();
      if (!price) throw new HttpError(503, "Prezzo non configurato");

      if (record.seatsStripeSubscriptionId) {
        try {
          await changeSeatQuantity(stripe, record.seatsStripeSubscriptionId, extraSeats, price);
          await applyExtraSeats(id, extraSeats, extraSeats === 0 ? null : record.seatsStripeSubscriptionId);
          return { mode: "updated" as const, extraSeats };
        } catch (error) {
          if (!isStripeMissing(error)) throw error;
          if (extraSeats === 0) {
            await applyExtraSeats(id, 0, null);
            return { mode: "updated" as const, extraSeats: 0 };
          }
        }
      } else if (extraSeats < record.extraSeats) {
        await applyExtraSeats(id, extraSeats, null);
        return { mode: "updated" as const, extraSeats };
      }

      const customerId = await customerFor(stripe, id, record.name, request.auth?.userId, record.stripeCustomerId);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: id,
        success_url: `${env.publicBaseUrl}/billing/done?status=ok&kind=seats`,
        cancel_url: `${env.publicBaseUrl}/billing/done?status=cancel&kind=seats`,
        metadata: { tenantId: id, kind: "seats", extraSeats: String(extraSeats) },
        subscription_data: {
          billing_mode: { type: "flexible" },
          metadata: { tenantId: id, kind: "seats", extraSeats: String(extraSeats) },
        },
        line_items: [{ price, quantity: extraSeats }],
        integration_identifier: integrationIdentifier("seats"),
      });
      if (!session.url) throw new HttpError(502, "Pagamento non disponibile");
      return { mode: "stripe" as const, url: session.url };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.post("/billing/portal", { preHandler: manage }, async (request) => {
    const stripe = stripeClient();
    if (!stripe) throw new HttpError(503, "Pagamenti non ancora configurati");
    const id = tenantId(request);
    const record = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    if (!record.stripeCustomerId) throw new HttpError(409, "Nessun abbonamento da gestire");
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: record.stripeCustomerId,
        return_url: `${env.publicBaseUrl}/billing/done?status=ok`,
      });
      return { url: session.url };
    } catch (error) {
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.get("/billing/done", async (request, reply) => {
    const query = request.query as { status?: string; kind?: string };
    const ok = query.status === "ok";
    const seats = query.kind === "seats";
    const title = ok ? (seats ? "Posto aggiunto" : "Modulo sbloccato") : "Pagamento annullato";
    const detail = ok
      ? seats
        ? "Torna in Bitora: l'utente in più sarà disponibile tra pochi secondi."
        : "Torna in Bitora: il modulo sarà attivo tra pochi secondi."
      : "Nessun addebito. Puoi tornare in Bitora.";
    reply.type("text/html; charset=utf-8");
    return `<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bitora</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,system-ui,sans-serif;background:#0E0F12;color:#fff;text-align:center">
<div><h1 style="font-weight:600">${title}</h1>
<p style="opacity:.7">${detail}</p></div></body></html>`;
  });

  await app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

    hook.post("/billing/webhook", async (request, reply) => {
      const stripe = stripeClient();
      if (!stripe || !env.stripeWebhookSecret) return reply.code(503).send({ error: "Webhook non configurato" });
      const raw = request.body as Buffer;
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(raw, request.headers["stripe-signature"] as string, env.stripeWebhookSecret);
      } catch {
        return reply.code(400).send({ error: "Firma non valida" });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const tenantKey = session.metadata?.tenantId;
        if (tenantKey && session.metadata?.kind === "seats") {
          const extra = Number(session.metadata.extraSeats);
          if (Number.isInteger(extra) && extra >= 0) await applyExtraSeats(tenantKey, extra, subscriptionId(session));
        } else if (tenantKey) {
          const tenant = await prisma.tenant.findUnique({ where: { id: tenantKey } });
          if (tenant) {
            const available = new Set((await categoryOfTenant(tenant.id)).modules.map((module) => module.key));
            const keys = (session.metadata?.moduleKeys ?? "").split(",").filter((key): key is ModuleKey => isModuleKey(key) && available.has(key));
            await licenseModules(tenant.id, keys, subscriptionId(session));
          }
        }
      }

      if (event.type === "customer.subscription.deleted" || (event.type === "customer.subscription.updated" && ENDED.has(event.data.object.status))) {
        const subscription = event.data.object.id;
        const seatTenant = await prisma.tenant.findFirst({ where: { seatsStripeSubscriptionId: subscription }, select: { id: true } });
        if (seatTenant) await applyExtraSeats(seatTenant.id, 0, null);
        await prisma.tenantModule.updateMany({
          where: { stripeSubscriptionId: subscription },
          data: { licensed: false, billingSource: null, stripeSubscriptionId: null },
        });
      }

      if (event.type === "customer.subscription.updated" && !ENDED.has(event.data.object.status)) {
        const seated = await prisma.tenant.findFirst({ where: { seatsStripeSubscriptionId: event.data.object.id } });
        const quantity = event.data.object.items.data[0]?.quantity;
        if (seated && typeof quantity === "number") await applyExtraSeats(seated.id, quantity, event.data.object.id);
      }

      return { received: true };
    });
  });
}
