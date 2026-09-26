import {
  mailtoHref,
  paymentConfigError,
  paymentMessage,
  PAYMENT_PROVIDER_LABEL,
  providerReady,
  revolutPayUrl,
  roundEuros,
  satispayPayUrl,
  satispayPhone,
  stripeKeyError,
  STRIPE_MIN_EUROS,
  whatsappHref,
  type PaymentConfigInput,
  type PaymentProvider,
  type PaymentStatus,
} from "@rapportini/shared";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import Stripe from "stripe";
import { blankToNull, HttpError, num } from "../errors";
import { env } from "../env";
import { prisma } from "./prisma";
import { stripeFor, stripeMessage } from "./stripe";

const CATEGORY = "Incassi";

export interface StoredPayments extends PaymentConfigInput {
  provider: PaymentProvider | null;
  revolut: string | null;
  satispay: string | null;
  stripeSecretKey: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readPayments(settings: unknown): StoredPayments {
  const payments = record(record(settings).payments);
  const provider = payments.provider;
  return {
    provider: provider === "STRIPE" || provider === "REVOLUT" || provider === "SATISPAY" ? provider : null,
    revolut: typeof payments.revolut === "string" ? payments.revolut : null,
    satispay: typeof payments.satispay === "string" ? payments.satispay : null,
    stripeSecretKey: typeof payments.stripeSecretKey === "string" && payments.stripeSecretKey ? payments.stripeSecretKey : null,
  };
}

export function publicPayments(config: StoredPayments) {
  return {
    provider: config.provider,
    revolut: config.revolut,
    satispay: config.satispay,
    stripeConfigured: Boolean(config.stripeSecretKey),
    ready: providerReady(config),
  };
}

export async function savePayments(tenantId: string, body: { provider: PaymentProvider | null; revolut?: string | null; satispay?: string | null; stripeSecretKey?: string }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  if (!tenant) throw new HttpError(404, "Negozio non trovato");
  const settings = record(tenant.settings);
  const current = readPayments(settings);
  let stripeSecretKey = body.stripeSecretKey === undefined ? current.stripeSecretKey : body.stripeSecretKey || null;
  if (body.stripeSecretKey) {
    const keyError = stripeKeyError(body.stripeSecretKey);
    if (keyError) throw new HttpError(400, keyError);
    await assertStripeKey(body.stripeSecretKey);
    stripeSecretKey = body.stripeSecretKey;
  }
  const next: StoredPayments = {
    provider: body.provider,
    revolut: blankToNull(body.revolut === undefined ? current.revolut : body.revolut),
    satispay: blankToNull(body.satispay === undefined ? current.satispay : body.satispay),
    stripeSecretKey,
  };
  const error = paymentConfigError(next);
  if (error) throw new HttpError(400, error);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...settings,
        payments: {
          provider: next.provider,
          revolut: next.revolut,
          satispay: next.satispay,
          stripeSecretKey: next.stripeSecretKey,
        },
      } as Prisma.InputJsonValue,
    },
  });
  return publicPayments(next);
}

async function assertStripeKey(key: string) {
  try {
    await stripeFor(key).accounts.retrieve(null);
  } catch (error) {
    if (error instanceof Stripe.errors.StripePermissionError) return;
    if (error instanceof Stripe.errors.StripeAuthenticationError) throw new HttpError(400, "Chiave Stripe rifiutata");
    throw new HttpError(400, stripeMessage(error));
  }
}

/** Production uses PUBLIC_BASE_URL. In local dev, reuse the host the phone already calls. */
export function payOrigin(host?: string) {
  const configured = env.publicBaseUrl.replace(/\/$/, "");
  const local = configured.includes("localhost") || configured.includes("127.0.0.1");
  if (!local || !host || host.includes("localhost") || host.includes("127.0.0.1")) return configured;
  return `http://${host}`;
}

export function payLink(origin: string, token: string) {
  return `${origin}/pay/${token}`;
}

function euro(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

type PaymentRow = {
  id: string;
  token: string;
  amount: Prisma.Decimal | number;
  paidAmount: Prisma.Decimal | number;
  status: PaymentStatus;
  method: string | null;
  note: string | null;
  sentEmailAt: Date | null;
  sentWhatsappAt: Date | null;
  paidAt: Date | null;
  workOrderId: string;
  workOrder: { title: string; status: string };
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
};

export function presentPayment(row: PaymentRow, config: StoredPayments, business: string, origin: string) {
  const amount = num(row.amount);
  const paidAmount = num(row.paidAmount);
  const remainder = roundEuros(Math.max(0, amount - paidAmount));
  const url = payLink(origin, row.token);
  const asking = row.status === "PAID" ? amount : remainder || amount;
  const amountLabel = euro(asking);
  const message = paymentMessage({ customerName: row.customer?.name, business, title: row.workOrder.title, amountLabel, url });
  const subject = `Pagamento ${amountLabel}`;
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    title: row.workOrder.title,
    workOrderStatus: row.workOrder.status,
    customer: row.customer ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone, email: row.customer.email } : null,
    amount,
    paidAmount,
    remainder,
    status: row.status,
    method: row.method,
    note: row.note,
    provider: config.provider,
    providerReady: providerReady(config),
    payUrl: url,
    qrPath: `/pay/${row.token}/qr.png`,
    message,
    subject,
    whatsappHref: row.customer?.phone ? whatsappHref(row.customer.phone, message) : null,
    mailtoHref: row.customer?.email ? mailtoHref(row.customer.email, subject, message) : null,
    sentEmailAt: row.sentEmailAt?.toISOString() ?? null,
    sentWhatsappAt: row.sentWhatsappAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

export async function qrPng(url: string) {
  return QRCode.toBuffer(url, { type: "png", width: 480, margin: 1, errorCorrectionLevel: "M" });
}

export function payPage(input: {
  business: string;
  title: string;
  status: PaymentStatus;
  amountLabel: string;
  remainder: number;
  remainderLabel: string;
  config: StoredPayments;
  token: string;
  note: string | null;
}) {
  const { config } = input;
  const open = input.status === "DUE" || input.status === "PARTIAL";
  const revolut = revolutPayUrl(config.revolut);
  const satispayLink = satispayPayUrl(config.satispay);
  const phone = satispayPhone(config.satispay);
  const blocks: string[] = [];
  if (input.status === "PAID") blocks.push(`<p class="ok">Pagamento ricevuto. Grazie.</p>`);
  else if (input.status === "CANCELLED") blocks.push(`<p>Questa richiesta non è più valida.</p>`);
  else if (config.provider === "STRIPE" && providerReady(config)) {
    if (belowCardMinimum(input.remainder)) blocks.push(`<p class="hint">Con la carta l'importo minimo è 0,50 €. Questo resto è ${esc(input.remainderLabel)}.</p>`);
    else blocks.push(`<form method="post" action="/pay/${esc(input.token)}/checkout"><button type="submit">Paga ${esc(input.remainderLabel)} con carta</button></form>`);
  } else if (config.provider === "REVOLUT" && revolut) {
    blocks.push(`<a class="btn" href="${esc(revolut)}">Apri Revolut</a><p class="hint">In Revolut indica ${esc(input.remainderLabel)}.</p>`);
  } else if (config.provider === "SATISPAY" && satispayLink) {
    blocks.push(`<a class="btn" href="${esc(satispayLink)}">Apri Satispay</a><p class="hint">Importo da pagare: ${esc(input.remainderLabel)}.</p>`);
  } else if (config.provider === "SATISPAY" && phone) {
    blocks.push(`<p class="phone">${esc(phone)}</p><p class="hint">Apri Satispay e invia ${esc(input.remainderLabel)} a questo numero.</p>`);
  } else if (open) {
    blocks.push(`<p class="hint">Mostra questa pagina a chi deve incassare.</p>`);
  }
  const provider = config.provider && open ? PAYMENT_PROVIDER_LABEL[config.provider] : "";
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(input.amountLabel)} · ${esc(input.business)}</title>
<style>
  body { margin: 0; background: #f3efe8; color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 440px; margin: 0 auto; padding: 28px 18px 48px; }
  .card { background: #fff; border-radius: 24px; padding: 24px 22px 22px; box-shadow: 0 12px 40px rgba(28, 25, 23, 0.06); }
  .who { margin: 0; color: #78716c; font-size: 14px; }
  h1 { font-size: 22px; line-height: 1.25; margin: 8px 0 0; letter-spacing: -0.03em; }
  .amount { font-size: 42px; line-height: 1.1; font-weight: 700; letter-spacing: -0.045em; margin: 14px 0 4px; }
  .ok { color: #157a45; font-weight: 600; }
  .hint, .note { color: #57534e; font-size: 15px; line-height: 1.4; }
  .phone { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; margin: 8px 0; }
  img { width: 220px; height: 220px; display: block; margin: 18px auto 8px; }
  .btn, button { display: block; width: 100%; box-sizing: border-box; margin-top: 16px; background: #1c1917; color: #fff; text-align: center; text-decoration: none; border: 0; border-radius: 14px; padding: 14px 16px; font: 600 17px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .provider { margin: 18px 0 0; text-align: center; color: #a8a29e; font-size: 13px; }
</style>
</head>
<body>
<main>
  <article class="card">
    <p class="who">${esc(input.business)}</p>
    <h1>${esc(input.title)}</h1>
    <p class="amount">${esc(open ? input.remainderLabel : input.amountLabel)}</p>
    ${input.note ? `<p class="note">${esc(input.note)}</p>` : ""}
    ${open ? `<img src="/pay/${esc(input.token)}/qr.png" width="220" height="220" alt="Codice per aprire questa pagina">` : ""}
    ${blocks.join("")}
    ${provider ? `<p class="provider">${esc(provider)}</p>` : ""}
  </article>
</main>
</body>
</html>`;
}

export async function syncCollectionLedger(payment: {
  id: string;
  tenantId: string;
  workOrderId: string;
  customerId: string | null;
  paidAmount: Prisma.Decimal | number;
  status: PaymentStatus;
  method: string | null;
  paidAt: Date | null;
  ledgerEntryId: string | null;
  title: string;
}) {
  const collected = payment.status === "DUE" || payment.status === "CANCELLED" ? 0 : num(payment.paidAmount);
  if (collected <= 0) {
    if (!payment.ledgerEntryId) return;
    await prisma.ledgerEntry.deleteMany({ where: { id: payment.ledgerEntryId, tenantId: payment.tenantId } });
    await prisma.workOrderPayment.update({ where: { id: payment.id }, data: { ledgerEntryId: null } });
    return;
  }
  const data = {
    kind: "INCOME" as const,
    amount: collected,
    category: CATEGORY,
    description: payment.title,
    method: payment.method,
    paid: true,
    customerId: payment.customerId,
    workOrderId: payment.workOrderId,
  };
  if (payment.ledgerEntryId) {
    const existing = await prisma.ledgerEntry.findFirst({ where: { id: payment.ledgerEntryId, tenantId: payment.tenantId } });
    if (existing) {
      await prisma.ledgerEntry.update({ where: { id: existing.id }, data });
      return;
    }
  }
  const entry = await prisma.ledgerEntry.create({ data: { tenantId: payment.tenantId, date: payment.paidAt ?? new Date(), ...data } });
  await prisma.workOrderPayment.update({ where: { id: payment.id }, data: { ledgerEntryId: entry.id } });
}

export function belowCardMinimum(remainder: number) {
  return remainder > 0 && remainder < STRIPE_MIN_EUROS;
}
