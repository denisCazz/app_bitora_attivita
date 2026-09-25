import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../env";
import { prisma } from "./prisma";

async function pushToUser(userId: string, title: string, body: string) {
  const tokens = await prisma.pushToken.findMany({ where: { userId } });
  if (!tokens.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tokens.map((token) => ({ to: token.token, title, body, sound: "default" }))),
  }).catch(() => undefined);
}

export async function runReminders() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const recent = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const schedules = await prisma.schedule.findMany({
    where: {
      dueAt: { lte: horizon, gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
      OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: recent } }],
    },
    take: 100,
  });
  for (const schedule of schedules) {
    const members = await prisma.membership.findMany({
      where: { tenantId: schedule.tenantId, status: "ACTIVE" },
      include: { role: true },
    });
    const recipients = members.filter((member) => member.role.permissions.includes("schedules.read") || member.role.isSystem);
    const when = schedule.dueAt.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    for (const recipient of recipients) {
      await prisma.notification.create({
        data: {
          tenantId: schedule.tenantId,
          userId: recipient.userId,
          title: "Promemoria manutenzione",
          body: `${schedule.title} · ${when}`,
        },
      });
      await pushToUser(recipient.userId, "Promemoria manutenzione", `${schedule.title} · ${when}`);
    }
    await prisma.schedule.update({ where: { id: schedule.id }, data: { lastRemindedAt: now } });
  }
  return schedules.length;
}

export function startReminders() {
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
