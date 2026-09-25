import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdir } from "node:fs/promises";
import { HttpError } from "./errors";
import { uploadDirectory } from "./lib/storage";
import { authPlugin } from "./plugins/auth";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { coreRoutes } from "./routes/core";
import { hospitalityRoutes } from "./routes/hospitality";
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
    reply.code(status).send({ error: status >= 500 ? "Errore interno" : message });
  });
  app.get("/health", async () => ({ ok: true }));
  await authPlugin(app);
  await app.register(authRoutes);
  await app.register(tenantRoutes);
  await app.register(coreRoutes);
  await app.register(stoveRoutes);
  await app.register(hospitalityRoutes);
  await app.register(settingsRoutes);
  await app.register(billingRoutes);
  await app.register(adminRoutes);
  return app;
}
