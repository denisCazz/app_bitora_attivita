import { mailtoHref, readReminderSettings, reminderMessage, whatsappHref, type ReminderChannel, type ReminderSettings } from "@rapportini/shared";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { HttpError } from "../errors";
import { emailReady, sendEmail } from "./email";
import { payOrigin } from "./payments";
import { prisma, tenantDb } from "./prisma";
import { esc, publicPage } from "./public-html";

const DAY = 86_400_000;
/** Overdue rounds stay on the list this long, so a late customer can still be called. */
const OVERDUE_DAYS = 60;
const EMAIL_SCAN_MS = 15 * 60 * 1000;
const OPEN_STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS"] as const;

const reminderInclude = {
  asset: {
    select: {
      id: true,
      name: true,
      customer: { select: { id: true, name: true, phone: true, email: true, reminderOptOutAt: true } },
    },
  },
  reminders: { select: { dueAt: true, channel: true, sentAt: true } },
  workOrders: {
    where: { status: { in: [...OPEN_STATUSES] } },
    select: { id: true, scheduledAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} satisfies Prisma.ScheduleInclude;

type ReminderSchedule = Prisma.ScheduleGetPayload<{ include: typeof reminderInclude }>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function tenantReminderSettings(row: { enabled?: boolean; daysBefore?: number; autoEmail?: boolean; message?: string | null } | null | undefined): ReminderSettings {
  return readReminderSettings(row ?? {});
}

export function publicReminderSettings(settings: ReminderSettings) {
  return { ...settings, emailReady: emailReady() };
}

export async function saveReminderSettings(tenantId: string, body: ReminderSettings) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new HttpError(404, "Negozio non trovato");
  const next = readReminderSettings(body);
  await prisma.tenantReminderSettings.upsert({
    where: { tenantId },
    create: { tenantId, enabled: next.enabled, daysBefore: next.daysBefore, autoEmail: next.autoEmail, message: next.message },
    update: { enabled: next.enabled, daysBefore: next.daysBefore, autoEmail: next.autoEmail, message: next.message },
  });
  return publicReminderSettings(next);
}

const optOutKey = createHmac("sha256", env.jwtRefreshSecret).update("customer-reminder-opt-out").digest();

function optOutSignature(customerId: string) {
  return createHmac("sha256", optOutKey).update(customerId).digest("base64url").slice(0, 32);
}

export function optOutUrl(origin: string, customerId: string) {
  return `${origin}/r/stop/${customerId}.${optOutSignature(customerId)}`;
}

export function optOutCustomerId(token: string): string | null {
  const [customerId, signature] = token.split(".");
  if (!customerId || !signature) return null;
  const given = Buffer.from(signature);
  const expected = Buffer.from(optOutSignature(customerId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? customerId : null;
}

function windowWhere(now: Date, daysBefore: number): Prisma.ScheduleWhereInput {
  return {
    dueAt: { gte: new Date(now.getTime() - OVERDUE_DAYS * DAY), lte: new Date(now.getTime() + daysBefore * DAY) },
    asset: { is: { customerId: { not: null } } },
  };
}

function sameRound(schedule: ReminderSchedule, channel: ReminderChannel) {
  return schedule.reminders.find((row) => row.channel === channel && row.dueAt.getTime() === schedule.dueAt.getTime());
}

function subjectOf(schedule: ReminderSchedule, business: string) {
  return `${schedule.title} in scadenza · ${business}`;
}

function present(schedule: ReminderSchedule, settings: ReminderSettings, business: string) {
  const customer = schedule.asset!.customer!;
  const optedOut = Boolean(customer.reminderOptOutAt);
  const message = reminderMessage(settings.message, {
    customerName: customer.name,
    what: schedule.title,
    asset: schedule.asset?.name,
    dueAt: schedule.dueAt,
    business,
  });
  const booked = schedule.workOrders[0];
  return {
    scheduleId: schedule.id,
    title: schedule.title,
    kind: schedule.kind,
    dueAt: schedule.dueAt.toISOString(),
    asset: { id: schedule.asset!.id, name: schedule.asset!.name },
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
    optedOut,
    booked: booked ? { id: booked.id, scheduledAt: booked.scheduledAt?.toISOString() ?? null } : null,
    emailedAt: sameRound(schedule, "EMAIL")?.sentAt.toISOString() ?? null,
    whatsappAt: sameRound(schedule, "WHATSAPP")?.sentAt.toISOString() ?? null,
    message,
    whatsappHref: optedOut ? null : whatsappHref(customer.phone, message),
    mailtoHref: optedOut ? null : mailtoHref(customer.email, subjectOf(schedule, business), message),
    canEmail: emailReady() && Boolean(customer.email) && !optedOut,
  };
}

export type PresentedReminder = ReturnType<typeof present>;

async function shopOf(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, reminderSettings: true } });
  if (!tenant) throw new HttpError(404, "Negozio non trovato");
  return { business: tenant.name, settings: tenantReminderSettings(tenant.reminderSettings) };
}

export async function listReminders(tenantId: string, now = new Date()) {
  const { business, settings } = await shopOf(tenantId);
  const schedules = await tenantDb(tenantId).schedule.findMany({
    where: windowWhere(now, settings.daysBefore),
    include: reminderInclude,
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  return {
    settings: publicReminderSettings(settings),
    items: schedules.filter((schedule) => schedule.asset?.customer).map((schedule) => present(schedule, settings, business)),
  };
}

async function reminderSchedule(tenantId: string, scheduleId: string) {
  const schedule = await tenantDb(tenantId).schedule.findFirst({ where: { id: scheduleId }, include: reminderInclude });
  if (!schedule) throw new HttpError(404, "Scadenza non trovata");
  if (!schedule.asset?.customer) throw new HttpError(400, "Questa scadenza non ha un cliente da avvisare");
  return schedule;
}

/** Records the reminder for this round; false when it was already recorded. */
async function claim(schedule: ReminderSchedule, channel: ReminderChannel) {
  try {
    await prisma.customerReminder.create({
      data: { tenantId: schedule.tenantId, scheduleId: schedule.id, customerId: schedule.asset!.customer!.id, dueAt: schedule.dueAt, channel },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

export async function markReminderSent(tenantId: string, scheduleId: string, channel: ReminderChannel) {
  const schedule = await reminderSchedule(tenantId, scheduleId);
  await claim(schedule, channel);
  const { business, settings } = await shopOf(tenantId);
  return present(await reminderSchedule(tenantId, scheduleId), settings, business);
}

async function shopReplyTo(tenantId: string) {
  const owner = await prisma.membership.findFirst({
    where: { tenantId, status: "ACTIVE", role: { isSystem: true } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { email: true } } },
  });
  return owner?.user.email ?? null;
}

function emailBody(message: string, business: string, stopUrl: string) {
  const paragraphs = message
    .split(/\n+/)
    .map((line) => `<p style="margin:0 0 14px">${esc(line)}</p>`)
    .join("");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:520px">${paragraphs}<p style="margin-top:28px;color:#78716c;font-size:13px">Ricevi questo promemoria perché sei cliente di ${esc(business)}. <a href="${esc(stopUrl)}" style="color:#78716c">Non voglio più promemoria</a></p></div>`;
  const text = `${message}\n\n—\nNon vuoi più promemoria da ${business}? ${stopUrl}`;
  return { html, text };
}

async function emailSchedule(schedule: ReminderSchedule, settings: ReminderSettings, business: string, replyTo: string | null, origin: string) {
  const customer = schedule.asset!.customer!;
  if (!customer.email) throw new HttpError(400, "Il cliente non ha un'email");
  if (customer.reminderOptOutAt) throw new HttpError(400, "Il cliente ha chiesto di non ricevere promemoria");
  if (!(await claim(schedule, "EMAIL"))) return false;
  const message = present(schedule, settings, business).message;
  const stopUrl = optOutUrl(origin, customer.id);
  const { html, text } = emailBody(message, business, stopUrl);
  try {
    await sendEmail({
      fromName: business,
      to: customer.email,
      replyTo,
      subject: subjectOf(schedule, business),
      html,
      text,
      headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      idempotencyKey: `customer-reminder/${schedule.id}/${schedule.dueAt.getTime()}`,
    });
    return true;
  } catch (error) {
    await prisma.customerReminder
      .delete({ where: { scheduleId_dueAt_channel: { scheduleId: schedule.id, dueAt: schedule.dueAt, channel: "EMAIL" } } })
      .catch(() => undefined);
    throw error instanceof HttpError ? error : new HttpError(502, error instanceof Error ? error.message : "Email non inviata");
  }
}

export async function emailReminderNow(tenantId: string, scheduleId: string, origin: string) {
  if (!emailReady()) throw new HttpError(400, "L'invio email non è configurato sul server");
  const schedule = await reminderSchedule(tenantId, scheduleId);
  const { business, settings } = await shopOf(tenantId);
  await emailSchedule(schedule, settings, business, await shopReplyTo(tenantId), origin);
  return present(await reminderSchedule(tenantId, scheduleId), settings, business);
}

let lastEmailScan = 0;

/** Background job: emails the rounds entering the window of shops that turned automatic email on. */
export async function emailDueReminders(now = new Date()) {
  if (!emailReady() || now.getTime() - lastEmailScan < EMAIL_SCAN_MS) return 0;
  lastEmailScan = now.getTime();
  const tenants = await prisma.tenant.findMany({
    where: { reminderSettings: { enabled: true, autoEmail: true } },
    select: { id: true, name: true, reminderSettings: true },
  });
  const origin = payOrigin();
  let sent = 0;
  for (const tenant of tenants) {
    const settings = tenantReminderSettings(tenant.reminderSettings);
    if (!settings.enabled || !settings.autoEmail) continue;
    const schedules = await prisma.schedule.findMany({
      where: {
        tenantId: tenant.id,
        dueAt: { gte: now, lte: new Date(now.getTime() + settings.daysBefore * DAY) },
        asset: { is: { customer: { is: { email: { not: null }, reminderOptOutAt: null } } } },
        workOrders: { none: { status: { in: [...OPEN_STATUSES] } } },
      },
      include: reminderInclude,
      orderBy: { dueAt: "asc" },
      take: 50,
    });
    const due = schedules.filter((schedule) => !sameRound(schedule, "EMAIL"));
    if (!due.length) continue;
    const replyTo = await shopReplyTo(tenant.id);
    for (const schedule of due) {
      try {
        if (await emailSchedule(schedule, settings, tenant.name, replyTo, origin)) sent += 1;
      } catch (error) {
        console.error("Promemoria cliente non inviato", schedule.id, error);
      }
    }
  }
  return sent;
}

export async function optOut(token: string) {
  const customerId = optOutCustomerId(token);
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, reminderOptOutAt: true, tenant: { select: { name: true } } } });
  if (!customer) return null;
  if (!customer.reminderOptOutAt) await prisma.customer.update({ where: { id: customer.id }, data: { reminderOptOutAt: new Date() } });
  return { business: customer.tenant.name };
}

export async function optOutPreview(token: string) {
  const customerId = optOutCustomerId(token);
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { reminderOptOutAt: true, tenant: { select: { name: true } } } });
  return customer ? { business: customer.tenant.name, stopped: Boolean(customer.reminderOptOutAt) } : null;
}

export function optOutPage(input: { business: string; token: string; stopped: boolean }) {
  const body = input.stopped
    ? `<div class="card"><p class="ok">Fatto. Non riceverai più promemoria da ${esc(input.business)}.</p><p class="hint">Se cambi idea, chiedilo direttamente al negozio.</p></div>`
    : `<div class="card"><p>Non vuoi più ricevere promemoria delle scadenze da ${esc(input.business)}?</p><form method="post" action="/r/stop/${esc(input.token)}"><button type="submit">Sì, non avvisarmi più</button></form></div>`;
  return publicPage({ title: "Promemoria", business: input.business, body });
}
