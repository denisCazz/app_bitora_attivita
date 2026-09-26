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
    const value = unquote(trimmed.slice(eq + 1).trim());
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function postgresUrl(): string {
  const host = process.env.DB_HOST?.trim();
  if (host) {
    const port = process.env.DB_PORT?.trim() || "5432";
    const user = process.env.DB_USER?.trim();
    const password = process.env.DB_PASSWORD ?? "";
    const name = process.env.DB_NAME?.trim() || "rapportini";
    if (!user) throw new Error("Variabile mancante: DB_USER");
    const ssl = (process.env.DB_SSL?.trim() || "require").toLowerCase();
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
    const query = ssl === "disable" ? "" : `?sslmode=${encodeURIComponent(ssl)}`;
    return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(name)}${query}`;
  }
  const existing = process.env.DATABASE_URL?.trim();
  if (existing) return existing;
  throw new Error("Imposta DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME in apps/api/.env");
}

process.env.DATABASE_URL = postgresUrl();

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
  apple: {
    bundleId: process.env.APPLE_BUNDLE_ID ?? "app.bitora.mobile",
    appAppleId: process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined,
    allowSandbox: process.env.APPLE_ALLOW_SANDBOX !== "false",
    teamId: process.env.APPLE_TEAM_ID,
    signInKeyId: process.env.APPLE_SIGNIN_KEY_ID,
    signInPrivateKey: process.env.APPLE_SIGNIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  google: {
    oauthClientIds: (process.env.GOOGLE_OAUTH_CLIENT_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    packageName: process.env.GOOGLE_PACKAGE_NAME ?? "app.bitora.mobile",
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    allowTestPurchases: process.env.GOOGLE_ALLOW_TEST_PURCHASES !== "false",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1",
    speechModel: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
    speechVoice: process.env.OPENAI_TTS_VOICE ?? "sage",
  },
  speech: {
    provider: (process.env.TTS_PROVIDER ?? "edge") as "edge" | "azure" | "elevenlabs" | "openai",
    voice: process.env.TTS_VOICE ?? "it-IT-IsabellaNeural",
    azure: { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION },
    elevenlabs: {
      key: process.env.ELEVENLABS_API_KEY,
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      model: process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5",
    },
  },
  legal: {
    company: process.env.LEGAL_COMPANY_NAME,
    vatNumber: process.env.LEGAL_VAT_NUMBER,
    address: process.env.LEGAL_ADDRESS,
    rea: process.env.LEGAL_REA,
    pec: process.env.LEGAL_PEC,
    email: process.env.LEGAL_PRIVACY_EMAIL,
    dpoEmail: process.env.LEGAL_DPO_EMAIL,
    court: process.env.LEGAL_COURT,
    hosting: process.env.LEGAL_HOSTING_PROVIDER,
  },
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
