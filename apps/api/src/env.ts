import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variabile mancante: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  redisUrl: process.env.REDIS_URL,
  port: Number(process.env.PORT ?? 3001),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  billingDemo: process.env.BILLING_DEMO === "true",
  s3: process.env.S3_BUCKET
    ? {
        endpoint: process.env.S3_ENDPOINT,
        bucket: process.env.S3_BUCKET,
        accessKey: process.env.S3_ACCESS_KEY ?? "",
        secretKey: process.env.S3_SECRET_KEY ?? "",
        region: process.env.S3_REGION ?? "auto",
      }
    : null,
};
