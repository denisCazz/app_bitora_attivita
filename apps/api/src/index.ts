import { buildApp } from "./app";
import { env } from "./env";
import { prisma } from "./lib/prisma";
import { startReminders } from "./lib/reminders";

const app = await buildApp();
const stopReminders = startReminders();
await app.listen({ port: env.port, host: "0.0.0.0" });

async function shutdown() {
  await stopReminders();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
