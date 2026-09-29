import {
  checkoutConfirmSchema,
  checkoutSchema,
  hasLicense,
  isDemoEmail,
  isModuleKey,
  portalSchema,
  seatsSchema,
  storePurchaseSchema,
  storeSyncSchema,
  stripeTrialEnd,
  trialKeys,
  trialSchema,
  type ModuleKey,
} from "@rapportini/shared";
import type { TenantModule } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { categoryOfTenant } from "../lib/catalog";
import { env } from "../env";
import { HttpError, must, parseBody } from "../errors";
import { payOrigin } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { applyExtraSeats } from "../lib/seats";
import { applyStoreRecord, verifyAppleNotification, verifyAppleTransaction, verifyGooglePurchase } from "../lib/store-billing";
import { ensureModulePrice, extraSeatPriceId, integrationIdentifier, isStripeMissing, stripeClient, stripeMessage } from "../lib/stripe";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

const DAY_MS = 24 * 60 * 60 * 1000;

type CheckoutKind = "modules" | "seats";

interface CheckoutOutcome {
  /** complete: unlocked · processing: paid with a slow method, unlocks when the bank confirms · open: not paid yet · expired: abandoned. */
  status: "complete" | "processing" | "open" | "expired";
  kind: CheckoutKind;
  moduleKeys: ModuleKey[];
  extraSeats: number | null;
  firstChargeAt: string | null;
}

function licensedRow(row: TenantModule | undefined) {
  return hasLicense(row ? { key: row.moduleKey as ModuleKey, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt, licenseExpiresAt: row.licenseExpiresAt } : undefined);
}

/** A cancelled Stripe subscription stays usable until the end of the paid period. */
function cancelDate(subscription: Stripe.Subscription): Date | null {
  const at = subscription.cancel_at ?? (subscription.cancel_at_period_end ? (subscription.items.data[0]?.current_period_end ?? null) : null);
  return at ? new Date(at * 1000) : null;
}

async function licenseModules(tenant: string, keys: ModuleKey[], subscription: Stripe.Subscription | null) {
  const billingSource = subscription ? ("STRIPE" as const) : ("DEMO" as const);
  const license = { enabled: true, licensed: true, billingSource, licenseExpiresAt: subscription ? cancelDate(subscription) : null, stripeSubscriptionId: subscription?.id ?? null };
  for (const moduleKey of keys) {
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId: tenant, moduleKey } },
      create: { tenantId: tenant, moduleKey, ...license },
      update: license,
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
  return { record, modules, category };
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

/** Web builds come back to the page they left; the phone lands on a short confirmation page served here. */
function checkoutUrls(host: string | undefined, kind: CheckoutKind, returnUrl?: string) {
  if (returnUrl) {
    const join = returnUrl.includes("?") ? "&" : "?";
    return { success_url: `${returnUrl}${join}checkout=done&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${returnUrl}${join}checkout=cancel` };
  }
  const base = `${payOrigin(host)}/billing/done?kind=${kind}`;
  return { success_url: `${base}&status=ok&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${base}&status=cancel` };
}

const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

async function subscriptionOf(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!session.subscription) return null;
  if (typeof session.subscription !== "string") return session.subscription;
  try {
    return await stripe.subscriptions.retrieve(session.subscription);
  } catch (error) {
    if (isStripeMissing(error)) return null;
    throw error;
  }
}

/**
 * Applies a finished Checkout Session. Safe to run many times (webhook, return page, app check):
 * the live subscription is the source of truth, so an old session can't undo later changes.
 */
async function applyCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session): Promise<CheckoutOutcome> {
  const kind: CheckoutKind = session.metadata?.kind === "seats" ? "seats" : "modules";
  const tenant = session.metadata?.tenantId;
  const outcome: CheckoutOutcome = { status: "open", kind, moduleKeys: [], extraSeats: null, firstChargeAt: session.metadata?.firstChargeAt || null };
  if (session.status === "expired") return { ...outcome, status: "expired" };
  if (session.status !== "complete" || !tenant) return outcome;
  if (session.payment_status === "unpaid") return { ...outcome, status: "processing" };

  const subscription = await subscriptionOf(stripe, session);
  if (!subscription || ENDED.has(subscription.status)) return { ...outcome, status: "expired" };

  if (kind === "seats") {
    const current = await prisma.tenant.findUnique({ where: { id: tenant }, select: { seatsStripeSubscriptionId: true } });
    const quantity = subscription.items.data[0]?.quantity ?? Number(session.metadata?.extraSeats);
    const superseded = current?.seatsStripeSubscriptionId && current.seatsStripeSubscriptionId !== subscription.id;
    if (!superseded && Number.isInteger(quantity) && quantity >= 0) await applyExtraSeats(tenant, quantity, subscription.id);
    return { ...outcome, status: "complete", extraSeats: quantity };
  }

  const available = new Set((await categoryOfTenant(tenant)).modules.map((module) => module.key));
  const keys = (session.metadata?.moduleKeys ?? "").split(",").filter((key): key is ModuleKey => isModuleKey(key) && available.has(key));
  await licenseModules(tenant, keys, subscription);
  const trialEnd = subscription.status === "trialing" && subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
  return { ...outcome, status: "complete", moduleKeys: keys, firstChargeAt: trialEnd ?? outcome.firstChargeAt };
}

async function retrieveSession(stripe: Stripe, sessionId: string) {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (isStripeMissing(error)) throw new HttpError(404, "Pagamento non trovato");
    throw new HttpError(502, stripeMessage(error));
  }
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

function donePage(title: string, detail: string) {
  return `<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bitora</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,system-ui,sans-serif;background:#0E0F12;color:#fff;text-align:center;padding:24px;box-sizing:border-box">
<div style="max-width:420px"><h1 style="font-weight:600">${title}</h1>
<p style="opacity:.75;line-height:1.5">${detail}</p>
<p style="opacity:.5;font-size:14px">Chiudi questa pagina per tornare in Bitora.</p></div></body></html>`;
}

function doneCopy(outcome: CheckoutOutcome | null, cancelled: boolean, kind: CheckoutKind) {
  const seats = kind === "seats";
  if (cancelled) return { title: "Pagamento annullato", detail: "Nessun addebito. Puoi riprovare quando vuoi." };
  if (!outcome) return { title: "Pagamento ricevuto", detail: seats ? "Il posto in più sarà disponibile tra pochi secondi." : "Il modulo sarà attivo tra pochi secondi." };
  if (outcome.status === "complete") {
    if (seats) return { title: "Posto aggiunto", detail: "L'utente in più è già disponibile." };
    return {
      title: "Modulo attivo",
      detail: outcome.firstChargeAt
        ? `Oggi non hai pagato nulla. Il primo addebito sarà il ${formatDay(outcome.firstChargeAt)}, alla fine della prova.`
        : "Pagamento riuscito: il modulo è già attivo per tutta la tua attività.",
    };
  }
  if (outcome.status === "processing") return { title: "Pagamento in verifica", detail: "La banca sta confermando il pagamento: di solito servono pochi minuti. Ti attiviamo appena arriva la conferma." };
  if (outcome.status === "expired") return { title: "Pagamento scaduto", detail: "Nessun addebito. Riprova dall'app." };
  return { title: "Pagamento non completato", detail: "Nessun addebito. Puoi riprovare dall'app." };
}

export async function billingRoutes(app: FastifyInstance) {
  const manage = [app.requireTenant, permit("settings.manage")];

  app.post("/billing/trial", { preHandler: manage }, async (request) => {
    const { moduleKey } = parseBody(trialSchema, request.body);
    const id = tenantId(request);
    const { modules, category } = await paidModulesFor(id, [moduleKey]);
    const definition = modules[0]!;
    if (!definition.trialDays) throw new HttpError(400, "Questo modulo non ha una prova gratuita");
    const rows = await prisma.tenantModule.findMany({ where: { tenantId: id } });
    const row = rows.find((item) => item.moduleKey === moduleKey);
    if (licensedRow(row)) throw new HttpError(409, "Modulo già attivo");
    if (row?.trialEndsAt) throw new HttpError(409, row.trialEndsAt > new Date() ? "La prova è già attiva" : "Hai già usato la prova gratuita di questo modulo");

    const now = Date.now();
    const keys = trialKeys(category.modules, [moduleKey]).filter((key) => {
      if (key === moduleKey) return true;
      const other = rows.find((item) => item.moduleKey === key);
      return !licensedRow(other) && !other?.trialEndsAt;
    });
    const started: Array<{ moduleKey: ModuleKey; trialEndsAt: Date }> = [];
    for (const key of keys) {
      const days = category.modules.find((module) => module.key === key)?.trialDays ?? 0;
      if (!days) continue;
      const trialEndsAt = new Date(now + days * DAY_MS);
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleKey: { tenantId: id, moduleKey: key } },
        create: { tenantId: id, moduleKey: key, enabled: true, trialEndsAt },
        update: { enabled: true, trialEndsAt },
      });
      started.push({ moduleKey: key, trialEndsAt });
    }
    return { moduleKey, trialEndsAt: started.find((item) => item.moduleKey === moduleKey)?.trialEndsAt ?? null, started };
  });

  app.post("/billing/checkout", { preHandler: manage }, async (request) => {
    const body = parseBody(checkoutSchema, request.body);
    const id = tenantId(request);
    const { record, modules } = await paidModulesFor(id, body.moduleKeys);
    const keys = modules.map((module) => module.key);
    const rows = await prisma.tenantModule.findMany({ where: { tenantId: id, moduleKey: { in: keys } } });
    if (rows.some(licensedRow)) throw new HttpError(409, "Modulo già attivo");
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

    const trialEnds = keys.map((key) => stripeTrialEnd(rows.find((row) => row.moduleKey === key)?.trialEndsAt));
    const trialEnd = trialEnds.every(Boolean) ? new Date(Math.min(...trialEnds.map((date) => date!.getTime()))) : null;
    const metadata = { tenantId: id, kind: "modules", moduleKeys: keys.join(","), firstChargeAt: trialEnd?.toISOString() ?? "" };

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: id,
        ...checkoutUrls(request.headers.host, "modules", body.returnUrl),
        metadata,
        subscription_data: {
          billing_mode: { type: "flexible" },
          metadata,
          ...(trialEnd ? { trial_end: Math.floor(trialEnd.getTime() / 1000) } : {}),
        },
        line_items: lineItems,
        integration_identifier: integrationIdentifier("modules"),
      });
      if (!session.url) throw new HttpError(502, "Pagamento non disponibile");
      return { mode: "stripe" as const, url: session.url, sessionId: session.id, firstChargeAt: metadata.firstChargeAt || null };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.post("/billing/checkout/confirm", { preHandler: manage }, async (request) => {
    const { sessionId } = parseBody(checkoutConfirmSchema, request.body);
    const stripe = stripeClient();
    if (!stripe) throw new HttpError(503, "Pagamenti non ancora configurati");
    const session = await retrieveSession(stripe, sessionId);
    if (session.metadata?.tenantId !== tenantId(request)) throw new HttpError(404, "Pagamento non trovato");
    return applyCheckoutSession(stripe, session);
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
    const { extraSeats, returnUrl } = parseBody(seatsSchema, request.body);
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
          await prisma.tenant.update({ where: { id }, data: { seatsStripeSubscriptionId: null } });
        }
      } else if (extraSeats < record.extraSeats) {
        await applyExtraSeats(id, extraSeats, null);
        return { mode: "updated" as const, extraSeats };
      }

      const customerId = await customerFor(stripe, id, record.name, request.auth?.userId, record.stripeCustomerId);
      const metadata = { tenantId: id, kind: "seats", extraSeats: String(extraSeats) };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: id,
        ...checkoutUrls(request.headers.host, "seats", returnUrl),
        metadata,
        subscription_data: { billing_mode: { type: "flexible" }, metadata },
        line_items: [{ price, quantity: extraSeats }],
        integration_identifier: integrationIdentifier("seats"),
      });
      if (!session.url) throw new HttpError(502, "Pagamento non disponibile");
      return { mode: "stripe" as const, url: session.url, sessionId: session.id };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.post("/billing/portal", { preHandler: manage }, async (request) => {
    const { returnUrl } = parseBody(portalSchema, request.body ?? {});
    const stripe = stripeClient();
    if (!stripe) throw new HttpError(503, "Pagamenti non ancora configurati");
    const id = tenantId(request);
    const record = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    if (!record.stripeCustomerId) throw new HttpError(409, "Nessun abbonamento da gestire");
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: record.stripeCustomerId,
        return_url: returnUrl ?? `${payOrigin(request.headers.host)}/billing/done?status=portal`,
      });
      return { url: session.url };
    } catch (error) {
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.get("/billing/done", async (request, reply) => {
    const query = request.query as { status?: string; kind?: string; session_id?: string };
    const kind: CheckoutKind = query.kind === "seats" ? "seats" : "modules";
    reply.type("text/html; charset=utf-8");
    if (query.status === "portal") return donePage("Abbonamento aggiornato", "Le modifiche compaiono in Bitora tra pochi secondi.");
    const stripe = stripeClient();
    let outcome: CheckoutOutcome | null = null;
    if (query.status === "ok" && stripe && typeof query.session_id === "string" && checkoutConfirmSchema.safeParse({ sessionId: query.session_id }).success) {
      try {
        outcome = await applyCheckoutSession(stripe, await stripe.checkout.sessions.retrieve(query.session_id));
      } catch (error) {
        request.log.warn({ error }, "Pagamento non verificato dalla pagina di ritorno");
      }
    }
    const copy = doneCopy(outcome, query.status !== "ok", kind);
    return donePage(copy.title, copy.detail);
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

      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        await applyCheckoutSession(stripe, event.data.object);
      }

      if (event.type === "customer.subscription.deleted" || (event.type === "customer.subscription.updated" && ENDED.has(event.data.object.status))) {
        const subscription = event.data.object.id;
        const seatTenant = await prisma.tenant.findFirst({ where: { seatsStripeSubscriptionId: subscription }, select: { id: true } });
        if (seatTenant) await applyExtraSeats(seatTenant.id, 0, null);
        await prisma.tenantModule.updateMany({
          where: { stripeSubscriptionId: subscription },
          data: { licensed: false, billingSource: null, licenseExpiresAt: null, stripeSubscriptionId: null },
        });
      }

      if (event.type === "customer.subscription.updated" && !ENDED.has(event.data.object.status)) {
        const subscription = event.data.object;
        await prisma.tenantModule.updateMany({
          where: { stripeSubscriptionId: subscription.id, licensed: true },
          data: { licenseExpiresAt: cancelDate(subscription) },
        });
        const seated = await prisma.tenant.findFirst({ where: { seatsStripeSubscriptionId: subscription.id } });
        const quantity = subscription.items.data[0]?.quantity;
        if (seated && typeof quantity === "number") await applyExtraSeats(seated.id, quantity, subscription.id);
      }

      return { received: true };
    });
  });
}
