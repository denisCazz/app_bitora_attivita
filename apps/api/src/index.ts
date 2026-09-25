import { buildApp } from "./app";
import { env } from "./env";
import { prisma } from "./lib/prisma";
import { startReminders } from "./lib/reminders";
import { syncStripeCatalog } from "./lib/stripe";

const app = await buildApp();
const stopReminders = startReminders();
await app.listen({ port: env.port, host: "0.0.0.0" });
void syncStripeCatalog().catch((error: unknown) => app.log.error(error, "Catalogo Stripe non aggiornato"));

async function shutdown() {
  await stopReminders();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
