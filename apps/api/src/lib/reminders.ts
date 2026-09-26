import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { num } from "../errors";
import { env } from "../env";
import { prisma } from "./prisma";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const COOLDOWN_MS = 20 * HOUR;
const LOW_STOCK_QTY = 2;
const SOON_MS = 3 * HOUR;
const ORDER_WAIT_MS = 30 * 60 * 1000;
const APPOINTMENT_KINDS = new Set(["APPOINTMENT", "REFILL", "COLOR", "TREATMENT", "REMINDER"]);

interface Member {
  userId: string;
  permissions: string[];
  isSystem: boolean;
}

interface Alert {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
}

function allows(member: Member, permission: string) {
  return member.isSystem || member.permissions.includes(permission);
}

function formatWhen(date: Date) {
  return date.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatQty(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function scheduleTitle(kind: string, dueAt: Date, now: Date) {
  const overdue = dueAt.getTime() < now.getTime();
  const soon = !overdue && dueAt.getTime() - now.getTime() <= SOON_MS;
  const appointment = APPOINTMENT_KINDS.has(kind);
  if (overdue) return appointment ? "Appuntamento passato" : "Scadenza passata";
  if (soon) return appointment ? "Appuntamento tra poco" : "Scadenza tra poco";
  return appointment ? "Appuntamento" : "Scadenza";
}

function workOrderTitle(scheduledAt: Date, assigned: boolean, now: Date) {
  if (!assigned) return scheduledAt.getTime() < now.getTime() ? "Intervento in ritardo" : "Appuntamento senza incaricato";
  if (scheduledAt.getTime() < now.getTime()) return "Intervento in ritardo";
  if (scheduledAt.getTime() - now.getTime() <= SOON_MS) return "Appuntamento tra poco";
  return "Appuntamento";
}

async function loadDirectory() {
  const rows = await prisma.membership.findMany({
    where: { status: "ACTIVE" },
    select: { tenantId: true, userId: true, role: { select: { permissions: true, isSystem: true } } },
  });
  const directory = new Map<string, Member[]>();
  for (const row of rows) {
    const members = directory.get(row.tenantId) ?? [];
    members.push({ userId: row.userId, permissions: row.role.permissions, isSystem: row.role.isSystem });
    directory.set(row.tenantId, members);
  }
  return directory;
}

function recipients(directory: Map<string, Member[]>, tenantId: string, permission: string) {
  return (directory.get(tenantId) ?? []).filter((member) => allows(member, permission));
}

async function remindSchedules(now: Date, directory: Map<string, Member[]>): Promise<{ alerts: Alert[]; ids: string[] }> {
  const horizon = new Date(now.getTime() + DAY);
  const recent = new Date(now.getTime() - COOLDOWN_MS);
  const schedules = await prisma.schedule.findMany({
    where: {
      dueAt: { lte: horizon, gte: new Date(now.getTime() - 2 * DAY) },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: recent } }],
    },
    include: { asset: { select: { name: true } } },
    take: 100,
  });
  const alerts: Alert[] = [];
  for (const schedule of schedules) {
    const title = scheduleTitle(schedule.kind, schedule.dueAt, now);
    const body = [schedule.title, schedule.asset?.name, formatWhen(schedule.dueAt)].filter(Boolean).join(" · ");
    for (const member of recipients(directory, schedule.tenantId, "schedules.read")) {
      alerts.push({
        tenantId: schedule.tenantId,
        userId: member.userId,
        title,
        body,
        href: "/calendar",
        dedupeKey: `schedule:${schedule.id}`,
      });
    }
  }
  return { alerts, ids: schedules.map((schedule) => schedule.id) };
}

async function remindAppointments(now: Date, directory: Map<string, Member[]>): Promise<Alert[]> {
  const orders = await prisma.workOrder.findMany({
    where: {
      scheduledAt: { gte: new Date(now.getTime() - 2 * DAY), lte: new Date(now.getTime() + DAY) },
      status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS"] },
    },
    include: { customer: { select: { name: true } } },
    take: 150,
  });
  const alerts: Alert[] = [];
  for (const order of orders) {
    if (!order.scheduledAt) continue;
    const members = directory.get(order.tenantId) ?? [];
    const assignee = order.assigneeId ? members.find((member) => member.userId === order.assigneeId) : undefined;
    const targets = assignee ? [assignee] : members.filter((member) => allows(member, "work_orders.read"));
    const title = workOrderTitle(order.scheduledAt, Boolean(assignee), now);
    const body = [order.title, order.customer?.name, formatWhen(order.scheduledAt)].filter(Boolean).join(" · ");
    for (const member of targets) {
      alerts.push({
        tenantId: order.tenantId,
        userId: member.userId,
        title,
        body,
        href: `/work-orders/${order.id}`,
        dedupeKey: `work-order:${order.id}`,
      });
    }
  }
  return alerts;
}

async function remindLowStock(directory: Map<string, Member[]>): Promise<Alert[]> {
  const [partBalances, ingredientBalances] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ["tenantId", "partId"],
      where: { partId: { not: null } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["tenantId", "ingredientId"],
      where: { ingredientId: { not: null } },
      _sum: { quantity: true },
    }),
  ]);
  const lowParts = partBalances.filter((row) => row.partId && num(row._sum.quantity) <= LOW_STOCK_QTY);
  const ingredientQty = new Map(ingredientBalances.flatMap((row) => (row.ingredientId ? [[row.ingredientId, num(row._sum.quantity)] as const] : [])));
  const [parts, ingredients] = await Promise.all([
    lowParts.length
      ? prisma.sparePart.findMany({
          where: { id: { in: lowParts.flatMap((row) => (row.partId ? [row.partId] : [])) } },
          select: { id: true, name: true },
        })
      : [],
    prisma.ingredient.findMany({
      where: { OR: [{ minQuantity: { gt: 0 } }, { id: { in: [...ingredientQty.keys()] } }] },
      select: { id: true, tenantId: true, name: true, unit: true, minQuantity: true },
    }),
  ]);
  const partNames = new Map(parts.map((part) => [part.id, part.name]));
  const lowIngredients = ingredients.flatMap((ingredient) => {
    const qty = ingredientQty.get(ingredient.id) ?? 0;
    const min = ingredient.minQuantity == null ? 0 : num(ingredient.minQuantity);
    return qty <= 0 || (min > 0 && qty <= min) ? [{ ...ingredient, qty, min }] : [];
  });
  const alerts: Alert[] = [];
  for (const row of lowParts) {
    if (!row.partId) continue;
    const name = partNames.get(row.partId);
    if (!name) continue;
    const qty = num(row._sum.quantity);
    for (const member of recipients(directory, row.tenantId, "spare_parts.read")) {
      alerts.push({
        tenantId: row.tenantId,
        userId: member.userId,
        title: qty <= 0 ? "Scorta esaurita" : "Sotto scorta",
        body: `${name} · giacenza ${formatQty(qty)}`,
        href: "/parts",
        dedupeKey: `stock:part:${row.partId}`,
      });
    }
  }
  for (const item of lowIngredients) {
    for (const member of recipients(directory, item.tenantId, "inventory.read")) {
      alerts.push({
        tenantId: item.tenantId,
        userId: member.userId,
        title: item.qty <= 0 ? "Scorta esaurita" : "Sotto scorta",
        body: `${item.name} · ${formatQty(Math.max(item.qty, 0))} ${item.unit}${item.min > 0 ? ` su minimo ${formatQty(item.min)}` : ""}`,
        href: "/inventory",
        dedupeKey: `stock:ingredient:${item.id}`,
      });
    }
  }
  return alerts;
}

async function remindShifts(now: Date, directory: Map<string, Member[]>): Promise<Alert[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      status: { in: ["PLANNED", "CONFIRMED"] },
      startsAt: { gte: new Date(now.getTime() - 30 * 60 * 1000), lte: new Date(now.getTime() + SOON_MS) },
      endsAt: { gt: now },
    },
    take: 100,
  });
  const alerts: Alert[] = [];
  for (const shift of shifts) {
    const member = (directory.get(shift.tenantId) ?? []).find((item) => item.userId === shift.userId);
    if (!member) continue;
    alerts.push({
      tenantId: shift.tenantId,
      userId: shift.userId,
      title: "Turno in arrivo",
      body: [shift.roleLabel, formatWhen(shift.startsAt)].filter(Boolean).join(" · "),
      href: "/shifts",
      dedupeKey: `shift:${shift.id}`,
    });
  }
  return alerts;
}

async function remindWaitingOrders(now: Date, directory: Map<string, Member[]>): Promise<Alert[]> {
  const cutoff = new Date(now.getTime() - ORDER_WAIT_MS);
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["OPEN", "SENT", "PARTIAL"] },
      lines: { some: { status: { in: ["PENDING", "SENT"] }, createdAt: { lte: cutoff } } },
    },
    select: {
      id: true,
      tenantId: true,
      table: { select: { name: true } },
      lines: {
        where: { status: { in: ["PENDING", "SENT"] }, createdAt: { lte: cutoff } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
    take: 80,
  });
  const alerts: Alert[] = [];
  for (const order of orders) {
    const since = order.lines[0]?.createdAt;
    if (!since) continue;
    const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60000));
    const where = order.table?.name ? `Tavolo ${order.table.name}` : "Comanda";
    for (const member of recipients(directory, order.tenantId, "orders.read")) {
      alerts.push({
        tenantId: order.tenantId,
        userId: member.userId,
        title: "Comanda in attesa",
        body: `${where} · ferma da ${minutes} min`,
        href: `/orders/${order.id}`,
        dedupeKey: `order-wait:${order.id}`,
      });
    }
  }
  return alerts;
}

async function remindTrials(now: Date, directory: Map<string, Member[]>): Promise<Alert[]> {
  const modules = await prisma.tenantModule.findMany({
    where: {
      enabled: true,
      licensed: false,
      trialEndsAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY) },
    },
    select: { tenantId: true, moduleKey: true, trialEndsAt: true },
    take: 80,
  });
  if (!modules.length) return [];
  const defs = await prisma.moduleDef.findMany({ select: { key: true, label: true } });
  const labels = new Map(defs.map((item) => [item.key, item.label]));
  const alerts: Alert[] = [];
  for (const module of modules) {
    if (!module.trialEndsAt) continue;
    const label = labels.get(module.moduleKey) ?? module.moduleKey;
    for (const member of recipients(directory, module.tenantId, "settings.manage")) {
      alerts.push({
        tenantId: module.tenantId,
        userId: member.userId,
        title: "Prova in scadenza",
        body: `${label} scade il ${formatWhen(module.trialEndsAt)}`,
        href: "/store",
        dedupeKey: `trial:${module.moduleKey}`,
      });
    }
  }
  return alerts;
}

async function pushAlerts(alerts: Alert[]) {
  const userIds = [...new Set(alerts.map((alert) => alert.userId))];
  if (!userIds.length) return;
  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
  const byUser = new Map<string, string[]>();
  for (const token of tokens) {
    const list = byUser.get(token.userId) ?? [];
    list.push(token.token);
    byUser.set(token.userId, list);
  }
  const messages = alerts.flatMap((alert) =>
    (byUser.get(alert.userId) ?? []).map((to) => ({
      to,
      title: alert.title,
      body: alert.body,
      sound: "default" as const,
      channelId: "alerts",
      data: { href: alert.href },
    })),
  );
  for (let index = 0; index < messages.length; index += 100) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(messages.slice(index, index + 100)),
    }).catch(() => undefined);
  }
}

async function deliver(alerts: Alert[], now: Date) {
  const unique = new Map<string, Alert>();
  for (const alert of alerts) unique.set(`${alert.tenantId}:${alert.userId}:${alert.dedupeKey}`, alert);
  const list = [...unique.values()];
  if (!list.length) return 0;
  const since = new Date(now.getTime() - COOLDOWN_MS);
  const seen = new Set<string>();
  for (let index = 0; index < list.length; index += 80) {
    const slice = list.slice(index, index + 80);
    const existing = await prisma.notification.findMany({
      where: {
        createdAt: { gte: since },
        OR: slice.map((alert) => ({ tenantId: alert.tenantId, userId: alert.userId, dedupeKey: alert.dedupeKey })),
      },
      select: { tenantId: true, userId: true, dedupeKey: true },
    });
    for (const row of existing) seen.add(`${row.tenantId}:${row.userId}:${row.dedupeKey}`);
  }
  const fresh = list.filter((alert) => !seen.has(`${alert.tenantId}:${alert.userId}:${alert.dedupeKey}`));
  if (!fresh.length) return 0;
  await prisma.notification.createMany({
    data: fresh.map((alert) => ({
      tenantId: alert.tenantId,
      userId: alert.userId,
      title: alert.title,
      body: alert.body,
      href: alert.href,
      dedupeKey: alert.dedupeKey,
    })),
  });
  await pushAlerts(fresh);
  return fresh.length;
}

async function collect<T>(label: string, job: () => Promise<T>) {
  try {
    return await job();
  } catch (error) {
    console.error(label, error);
    return null;
  }
}

let scanning = false;

export async function runReminders() {
  if (scanning) return 0;
  scanning = true;
  try {
    const now = new Date();
    const directory = await loadDirectory();
    const schedules = await collect("Appuntamenti", () => remindSchedules(now, directory));
    const rest = await Promise.all([
      collect("Interventi", () => remindAppointments(now, directory)),
      collect("Scorte", () => remindLowStock(directory)),
      collect("Turni", () => remindShifts(now, directory)),
      collect("Comande", () => remindWaitingOrders(now, directory)),
      collect("Prove", () => remindTrials(now, directory)),
    ]);
    const alerts = [...(schedules?.alerts ?? []), ...rest.flatMap((batch) => batch ?? [])];
    const sent = await deliver(alerts, now);
    if (schedules?.ids.length) {
      await prisma.schedule.updateMany({ where: { id: { in: schedules.ids } }, data: { lastRemindedAt: now } });
    }
    return sent;
  } finally {
    scanning = false;
  }
}

export function startReminders() {
  void runReminders().catch((error) => console.error("Promemoria", error));
  if (!env.redisUrl) {
    const timer = setInterval(() => {
      void runReminders().catch((error) => console.error("Promemoria", error));
    }, 60_000);
    return () => clearInterval(timer);
  }
  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  connection.on("error", () => undefined);
  workerConnection.on("error", () => undefined);
  const queue = new Queue("reminders", { connection });
  void queue.add("scan", {}, { repeat: { every: 60_000 }, jobId: "reminder-scan" });
  const worker = new Worker("reminders", () => runReminders(), { connection: workerConnection });
  return async () => {
    await worker.close();
    await queue.close();
    connection.disconnect();
    workerConnection.disconnect();
  };
}
