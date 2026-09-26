import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdir } from "node:fs/promises";
import { HttpError } from "./errors";
import { uploadDirectory } from "./lib/storage";
import { authPlugin } from "./plugins/auth";
import { accountingRoutes } from "./routes/accounting";
import { adminRoutes } from "./routes/admin";
import { assistantRoutes } from "./routes/assistant";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { coreRoutes } from "./routes/core";
import { hospitalityRoutes } from "./routes/hospitality";
import { inventoryRoutes } from "./routes/inventory";
import { legalRoutes } from "./routes/legal";
import { paymentRoutes } from "./routes/payments";
import { payrollRoutes } from "./routes/payroll";
import { settingsRoutes } from "./routes/settings";
import { stoveRoutes } from "./routes/stove";
import { tenantRoutes } from "./routes/tenants";
import "./types";

export async function buildApp() {
  const app = Fastify({ logger: true });
  await mkdir(uploadDirectory(), { recursive: true });
  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
  await app.register(fastifyStatic, { root: uploadDirectory(), prefix: "/uploads/" });
  app.setErrorHandler((error: unknown, request, reply) => {
    const status =
      error instanceof HttpError
        ? error.statusCode
        : typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;
    const message = error instanceof Error ? error.message : "Errore";
    if (status >= 500) request.log.error(error);
    reply.code(status).send({ error: status >= 500 && !(error instanceof HttpError) ? "Errore interno" : message });
  });
  app.get("/health", async () => ({ ok: true }));
  await authPlugin(app);
  await app.register(legalRoutes);
  await app.register(authRoutes);
  await app.register(tenantRoutes);
  await app.register(coreRoutes);
  await app.register(stoveRoutes);
  await app.register(hospitalityRoutes);
  await app.register(inventoryRoutes);
  await app.register(accountingRoutes);
  await app.register(payrollRoutes);
  await app.register(paymentRoutes);
  await app.register(settingsRoutes);
  await app.register(billingRoutes);
  await app.register(adminRoutes);
  await app.register(assistantRoutes);
  return app;
}
