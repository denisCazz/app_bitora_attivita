import {
  nextPaymentAmounts,
  paymentConfigSchema,
  paymentPatchSchema,
  paymentSentSchema,
  paymentWriteSchema,
  roundEuros,
  STRIPE_MIN_EUROS,
} from "@rapportini/shared";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { blankToNull, HttpError, must, num, parseBody } from "../errors";
import {
  belowCardMinimum,
  payLink,
  payOrigin,
  payPage,
  presentPayment,
  publicPayments,
  qrPng,
  readPayments,
  savePayments,
  syncCollectionLedger,
} from "../lib/payments";
import { prisma, tenantDb } from "../lib/prisma";
import { stripeFor, stripeMessage } from "../lib/stripe";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

const include = {
  workOrder: { select: { id: true, title: true, status: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
} as const;

function idOf(request: { params: unknown }) {
  return (request.params as { id: string }).id;
}

function tokenOf(request: { params: unknown }) {
  return (request.params as { token: string }).token;
}

function originOf(request: { headers: { host?: string } }) {
  return payOrigin(request.headers.host);
}

export async function paymentRoutes(app: FastifyInstance) {
  const read = { preHandler: [app.requireTenant, permit("accounting.read"), moduleGuard("accounting")] };
  const write = { preHandler: [app.requireTenant, permit("accounting.write"), moduleGuard("accounting")] };
  const manage = { preHandler: [app.requireTenant, permit("settings.manage")] };

  app.get("/settings/payments", manage, async (request) => {
    const tenant = await must(prisma.tenant.findUnique({ where: { id: tenantId(request) }, select: { settings: true } }), "Negozio");
    return publicPayments(readPayments(tenant.settings));
  });

  app.put("/settings/payments", manage, async (request) => {
    const body = parseBody(paymentConfigSchema, request.body);
    return savePayments(tenantId(request), body);
  });

  app.get("/payments", read, async (request) => {
    const id = tenantId(request);
    const db = tenantDb(id);
    const [tenant, rows] = await Promise.all([
      must(prisma.tenant.findUnique({ where: { id }, select: { name: true, settings: true } }), "Negozio"),
      db.workOrderPayment.findMany({ include, orderBy: { updatedAt: "desc" }, take: 200 }),
    ]);
    const config = readPayments(tenant.settings);
    const origin = originOf(request);
    return rows.map((row) => presentPayment(row, config, tenant.name, origin));
  });

  app.get("/payments/work-orders", read, async (request) => {
    const focus = (request.query as { workOrderId?: string }).workOrderId;
    const db = tenantDb(tenantId(request));
    const select = { id: true, title: true, status: true, customer: { select: { name: true } }, payment: { select: { id: true } } } as const;
    const rows = await db.workOrder.findMany({
      where: { status: { not: "CANCELLED" } },
      select,
      orderBy: { updatedAt: "desc" },
      take: 80,
    });
    if (focus && !rows.some((row) => row.id === focus)) {
      const extra = await db.workOrder.findFirst({ where: { id: focus }, select });
      if (extra) rows.unshift(extra);
    }
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      customerName: row.customer?.name ?? null,
      paymentId: row.payment?.id ?? null,
    }));
  });

  app.post("/payments", write, async (request) => {
    const body = parseBody(paymentWriteSchema, request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    const workOrder = await must(db.workOrder.findFirst({ where: { id: body.workOrderId }, select: { id: true, customerId: true, title: true } }), "Intervento");
    const tenant = await must(prisma.tenant.findUnique({ where: { id }, select: { name: true, settings: true } }), "Negozio");
    try {
      const row = await prisma.workOrderPayment.create({
        data: {
          tenantId: id,
          workOrderId: workOrder.id,
          customerId: workOrder.customerId,
          amount: roundEuros(body.amount),
          note: blankToNull(body.note),
          token: randomBytes(24).toString("base64url"),
        },
        include,
      });
      return presentPayment(row, readPayments(tenant.settings), tenant.name, originOf(request));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new HttpError(409, "Questo intervento ha già un pagamento");
      }
      throw error;
    }
  });

  app.patch("/payments/:id", write, async (request) => {
    const body = parseBody(paymentPatchSchema, request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    const row = await must(db.workOrderPayment.findFirst({ where: { id: idOf(request) }, include }), "Pagamento");
    const next = nextPaymentAmounts(
      { amount: num(row.amount), paidAmount: num(row.paidAmount), status: row.status },
      { amount: body.amount, paidAmount: body.paidAmount, status: body.status },
    );
    if ("error" in next) throw new HttpError(400, next.error);
    const tenant = await must(prisma.tenant.findUnique({ where: { id }, select: { name: true, settings: true } }), "Negozio");
    const collecting = next.status === "PARTIAL" || next.status === "PAID";
    const updated = await db.workOrderPayment.update({
      where: { id: row.id },
      data: {
        amount: next.amount,
        paidAmount: next.paidAmount,
        status: next.status,
        method: body.method === undefined ? undefined : blankToNull(body.method),
        note: body.note === undefined ? undefined : blankToNull(body.note),
        paidAt: collecting ? (row.paidAt ?? new Date()) : null,
      },
      include,
    });
    await syncCollectionLedger({
      id: updated.id,
      tenantId: id,
      workOrderId: updated.workOrderId,
      customerId: updated.customerId,
      paidAmount: updated.paidAmount,
      status: updated.status,
      method: updated.method,
      paidAt: updated.paidAt,
      ledgerEntryId: updated.ledgerEntryId,
      title: updated.workOrder.title,
    });
    const fresh = await must(db.workOrderPayment.findFirst({ where: { id: updated.id }, include }), "Pagamento");
    return presentPayment(fresh, readPayments(tenant.settings), tenant.name, originOf(request));
  });

  app.post("/payments/:id/sent", write, async (request) => {
    const body = parseBody(paymentSentSchema, request.body);
    const db = tenantDb(tenantId(request));
    await must(db.workOrderPayment.findFirst({ where: { id: idOf(request) } }), "Pagamento");
    await db.workOrderPayment.update({
      where: { id: idOf(request) },
      data: body.channel === "email" ? { sentEmailAt: new Date() } : { sentWhatsappAt: new Date() },
    });
    return { ok: true };
  });

  app.get("/pay/:token", async (request, reply) => {
    const page = await loadPayPage(tokenOf(request));
    if (!page) return reply.code(404).type("text/html; charset=utf-8").send(missingPage());
    return reply.type("text/html; charset=utf-8").send(page);
  });

  app.get("/pay/:token/qr.png", async (request, reply) => {
    const payment = await prisma.workOrderPayment.findUnique({ where: { token: tokenOf(request) }, select: { token: true } });
    if (!payment) return reply.code(404).send({ error: "Pagamento non trovato" });
    const png = await qrPng(payLink(originOf(request), payment.token));
    return reply.type("image/png").header("cache-control", "private, max-age=3600").send(png);
  });

  app.post("/pay/:token/checkout", async (request, reply) => {
    const payment = await prisma.workOrderPayment.findUnique({
      where: { token: tokenOf(request) },
      include: { workOrder: { select: { title: true } }, tenant: { select: { settings: true } } },
    });
    if (!payment || payment.status === "CANCELLED" || payment.status === "PAID") {
      return reply.redirect(payLink(originOf(request), tokenOf(request)), 303);
    }
    const config = readPayments(payment.tenant.settings);
    if (config.provider !== "STRIPE" || !config.stripeSecretKey) throw new HttpError(409, "Pagamento con carta non configurato");
    const remainder = roundEuros(Math.max(0, num(payment.amount) - num(payment.paidAmount)));
    if (belowCardMinimum(remainder)) throw new HttpError(400, `L'importo minimo con carta è ${STRIPE_MIN_EUROS.toLocaleString("it-IT")} €`);
    const origin = originOf(request);
    try {
      const session = await stripeFor(config.stripeSecretKey).checkout.sessions.create({
        mode: "payment",
        client_reference_id: payment.id,
        metadata: { paymentId: payment.id, tenantId: payment.tenantId },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: Math.round(remainder * 100),
              product_data: { name: payment.workOrder.title.slice(0, 120) },
            },
          },
        ],
        success_url: `${origin}/pay/${payment.token}/done?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pay/${payment.token}`,
      });
      if (!session.url) throw new HttpError(502, "Stripe non ha restituito il link");
      return reply.redirect(session.url, 303);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, stripeMessage(error));
    }
  });

  app.get("/pay/:token/done", async (request, reply) => {
    const sessionId = (request.query as { session_id?: string }).session_id;
    const token = tokenOf(request);
    if (!sessionId) return reply.redirect(payLink(originOf(request), token), 303);
    const payment = await prisma.workOrderPayment.findUnique({
      where: { token },
      include: { workOrder: { select: { title: true } }, tenant: { select: { settings: true, name: true } } },
    });
    if (!payment) return reply.code(404).type("text/html; charset=utf-8").send(missingPage());
    const config = readPayments(payment.tenant.settings);
    if (!config.stripeSecretKey) return reply.redirect(payLink(originOf(request), token), 303);
    let paid = payment.status === "PAID";
    if (!paid) {
      const session = await stripeFor(config.stripeSecretKey).checkout.sessions.retrieve(sessionId);
      if (session.metadata?.paymentId === payment.id && session.payment_status === "paid") {
        paid = await settleStripe(payment.id);
      }
    }
    const fresh = await prisma.workOrderPayment.findUnique({ where: { id: payment.id }, include });
    if (!fresh) return reply.code(404).type("text/html; charset=utf-8").send(missingPage());
    const html = payPage({
      business: payment.tenant.name,
      title: fresh.workOrder.title,
      status: paid ? "PAID" : fresh.status,
      amountLabel: euro(num(fresh.amount)),
      remainder: roundEuros(Math.max(0, num(fresh.amount) - num(fresh.paidAmount))),
      remainderLabel: euro(roundEuros(Math.max(0, num(fresh.amount) - num(fresh.paidAmount)))),
      config,
      token,
      note: paid ? null : "Il pagamento non risulta ancora confermato.",
    });
    return reply.type("text/html; charset=utf-8").send(html);
  });
}

async function loadPayPage(token: string) {
  const payment = await prisma.workOrderPayment.findUnique({
    where: { token },
    include: { workOrder: { select: { title: true } }, tenant: { select: { name: true, settings: true } } },
  });
  if (!payment) return null;
  const remainder = roundEuros(Math.max(0, num(payment.amount) - num(payment.paidAmount)));
  return payPage({
    business: payment.tenant.name,
    title: payment.workOrder.title,
    status: payment.status,
    amountLabel: euro(num(payment.amount)),
    remainder,
    remainderLabel: euro(remainder),
    config: readPayments(payment.tenant.settings),
    token,
    note: payment.note,
  });
}

async function settleStripe(id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.workOrderPayment.findUnique({ where: { id }, include: { workOrder: { select: { title: true } } } });
    if (!current || current.status === "PAID") return true;
    const amount = num(current.amount);
    let ledgerEntryId = current.ledgerEntryId;
    const entryData = {
      kind: "INCOME" as const,
      amount,
      category: "Incassi",
      description: current.workOrder.title,
      method: "Stripe",
      paid: true,
      customerId: current.customerId,
      workOrderId: current.workOrderId,
    };
    if (ledgerEntryId) {
      await tx.ledgerEntry.update({ where: { id: ledgerEntryId }, data: entryData });
    } else {
      const entry = await tx.ledgerEntry.create({ data: { tenantId: current.tenantId, date: new Date(), ...entryData } });
      ledgerEntryId = entry.id;
    }
    await tx.workOrderPayment.update({
      where: { id: current.id },
      data: { status: "PAID", paidAmount: amount, method: "Stripe", paidAt: current.paidAt ?? new Date(), ledgerEntryId },
    });
    return true;
  });
}

function euro(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function missingPage() {
  return `<!doctype html><html lang="it"><meta charset="utf-8"><title>Pagamento</title><body style="font-family:sans-serif;padding:32px"><p>Questo link di pagamento non esiste più.</p></body></html>`;
}
