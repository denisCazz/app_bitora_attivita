import { readFileSync } from "node:fs";
import {
  AutoRenewStatus,
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import type { StorePlatform } from "@prisma/client";
import { moduleKeyOfProduct, type ModuleKey } from "@rapportini/shared";
import { GoogleAuth } from "google-auth-library";
import { env } from "../env";
import { HttpError } from "../errors";
import { categoryOfTenant } from "./catalog";
import { prisma } from "./prisma";

export interface StoreRecord {
  platform: StorePlatform;
  purchaseKey: string;
  productId: string;
  accountToken: string | null;
  environment: string;
  active: boolean;
  autoRenewing: boolean;
  expiresAt: Date | null;
}

const APPLE_ROOTS = ["AppleRootCA-G3.cer", "AppleIncRootCertificate.cer", "AppleComputerRootCertificate.cer"];
let appleRoots: Buffer[] | null = null;
const appleVerifiers = new Map<Environment, SignedDataVerifier>();

function appleVerifier(environment: string | undefined): SignedDataVerifier {
  if (environment === Environment.SANDBOX && !env.apple.allowSandbox) throw new HttpError(400, "Acquisti di prova non accettati");
  if (environment !== Environment.SANDBOX && environment !== Environment.PRODUCTION) throw new HttpError(400, "Ambiente di acquisto non valido");
  if (environment === Environment.PRODUCTION && !env.apple.appAppleId) throw new HttpError(503, "Acquisti App Store non configurati");
  let verifier = appleVerifiers.get(environment);
  if (!verifier) {
    appleRoots ??= APPLE_ROOTS.map((name) => readFileSync(new URL(`../../certs/apple/${name}`, import.meta.url)));
    verifier = new SignedDataVerifier(appleRoots, true, environment, env.apple.bundleId, env.apple.appAppleId);
    appleVerifiers.set(environment, verifier);
  }
  return verifier;
}

/** Reads the claimed environment so the matching verifier checks the signature; nothing here is trusted yet. */
function claimedEnvironment(jws: string, pick: (payload: Record<string, unknown>) => unknown): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(jws.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    const value = pick(payload);
    return typeof value === "string" ? value : undefined;
  } catch {
    throw new HttpError(400, "Ricevuta non leggibile");
  }
}

function appleRecord(transaction: JWSTransactionDecodedPayload, renewal?: JWSRenewalInfoDecodedPayload): StoreRecord {
  if (!transaction.originalTransactionId || !transaction.productId) throw new HttpError(400, "Ricevuta incompleta");
  const expiresMs = Math.max(transaction.expiresDate ?? 0, renewal?.gracePeriodExpiresDate ?? 0);
  const expiresAt = expiresMs ? new Date(expiresMs) : null;
  return {
    platform: "APPLE",
    purchaseKey: transaction.originalTransactionId,
    productId: transaction.productId,
    accountToken: transaction.appAccountToken?.toLowerCase() ?? null,
    environment: String(transaction.environment ?? "Production"),
    active: !transaction.revocationDate && Boolean(expiresAt && expiresAt > new Date()),
    autoRenewing: renewal ? renewal.autoRenewStatus === AutoRenewStatus.ON : true,
    expiresAt,
  };
}

export async function verifyAppleTransaction(jws: string): Promise<StoreRecord> {
  const verifier = appleVerifier(claimedEnvironment(jws, (payload) => payload.environment));
  try {
    return appleRecord(await verifier.verifyAndDecodeTransaction(jws));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Ricevuta App Store non valida");
  }
}

export async function verifyAppleNotification(signedPayload: string): Promise<{ notification: ResponseBodyV2DecodedPayload; record: StoreRecord | null }> {
  const verifier = appleVerifier(claimedEnvironment(signedPayload, (payload) => (payload.data as { environment?: unknown } | undefined)?.environment));
  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  const signedTransaction = notification.data?.signedTransactionInfo;
  if (!signedTransaction) return { notification, record: null };
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
  const signedRenewal = notification.data?.signedRenewalInfo;
  const renewal = signedRenewal ? await verifier.verifyAndDecodeRenewalInfo(signedRenewal) : undefined;
  return { notification, record: appleRecord(transaction, renewal) };
}

interface GoogleSubscription {
  subscriptionState?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  testPurchase?: object;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{ productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }>;
}

const GOOGLE_ENTITLED = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]);
let googleAuth: GoogleAuth | null = null;

function googleClient() {
  if (!env.google.serviceAccountJson) throw new HttpError(503, "Acquisti Google Play non configurati");
  googleAuth ??= new GoogleAuth({
    credentials: JSON.parse(env.google.serviceAccountJson) as Record<string, string>,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return googleAuth.getClient();
}

const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export async function verifyGooglePurchase(purchaseToken: string): Promise<StoreRecord> {
  const client = await googleClient();
  const app = encodeURIComponent(env.google.packageName);
  const token = encodeURIComponent(purchaseToken);
  let subscription: GoogleSubscription;
  try {
    subscription = (await client.request<GoogleSubscription>({ url: `${PLAY_API}/${app}/purchases/subscriptionsv2/tokens/${token}` })).data;
  } catch {
    throw new HttpError(400, "Acquisto Google Play non trovato");
  }
  if (subscription.testPurchase && !env.google.allowTestPurchases) throw new HttpError(400, "Acquisti di prova non accettati");
  const item = subscription.lineItems?.[0];
  if (!item?.productId) throw new HttpError(400, "Acquisto Google Play incompleto");
  const expiresAt = item.expiryTime ? new Date(item.expiryTime) : null;
  const active = GOOGLE_ENTITLED.has(subscription.subscriptionState ?? "") && Boolean(expiresAt && expiresAt > new Date());

  if (active && subscription.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    await client
      .request({ url: `${PLAY_API}/${app}/purchases/subscriptions/${encodeURIComponent(item.productId)}/tokens/${token}:acknowledge`, method: "POST" })
      .catch(() => undefined);
  }
  if (subscription.linkedPurchaseToken) {
    await prisma.storePurchase.updateMany({ where: { platform: "GOOGLE", purchaseKey: subscription.linkedPurchaseToken }, data: { active: false } });
  }

  return {
    platform: "GOOGLE",
    purchaseKey: purchaseToken,
    productId: item.productId,
    accountToken: subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId?.toLowerCase() ?? null,
    environment: subscription.testPurchase ? "Test" : "Production",
    active,
    autoRenewing: Boolean(item.autoRenewingPlan?.autoRenewEnabled),
    expiresAt,
  };
}

/** Keeps the module license in step with the best active store subscription; Stripe and demo licenses are left alone when none exists. */
async function refreshStoreLicense(tenantId: string, moduleKey: ModuleKey) {
  const best = await prisma.storePurchase.findFirst({
    where: { tenantId, moduleKey, active: true },
    orderBy: { expiresAt: { sort: "desc", nulls: "first" } },
  });
  const where = { tenantId_moduleKey: { tenantId, moduleKey } };
  const row = await prisma.tenantModule.findUnique({ where });
  if (best) {
    await prisma.tenantModule.upsert({
      where,
      create: { tenantId, moduleKey, enabled: true, licensed: true, billingSource: best.platform, licenseExpiresAt: best.expiresAt },
      update: { licensed: true, enabled: row?.licensed ? row.enabled : true, billingSource: best.platform, licenseExpiresAt: best.expiresAt, stripeSubscriptionId: null },
    });
  } else if (row?.licensed && (row.billingSource === "APPLE" || row.billingSource === "GOOGLE")) {
    await prisma.tenantModule.update({ where, data: { licensed: false, billingSource: null, licenseExpiresAt: null } });
  }
}

/**
 * Links a verified store subscription to a shop and updates the module license.
 * A subscription belongs to the shop whose account token it carries (or that first claimed it) and can't be moved.
 */
export async function applyStoreRecord(record: StoreRecord, claimingTenantId?: string) {
  const moduleKey = moduleKeyOfProduct(record.productId);
  if (!moduleKey) throw new HttpError(400, "Prodotto sconosciuto");

  const existing = await prisma.storePurchase.findUnique({
    where: { platform_purchaseKey: { platform: record.platform, purchaseKey: record.purchaseKey } },
  });
  const owner = record.accountToken ? await prisma.tenant.findUnique({ where: { storeAccountToken: record.accountToken }, select: { id: true } }) : null;
  const tenantId = existing?.tenantId ?? owner?.id ?? claimingTenantId;
  if (!tenantId) throw new HttpError(404, "Acquisto non collegato a nessuna attività");
  if (claimingTenantId && claimingTenantId !== tenantId) throw new HttpError(409, "Questo abbonamento è già collegato a un'altra attività");

  const definition = (await categoryOfTenant(tenantId)).modules.find((module) => module.key === moduleKey);
  if (!definition || definition.free) throw new HttpError(400, "Modulo non disponibile per questa attività");

  const data = {
    productId: record.productId,
    moduleKey,
    environment: record.environment,
    active: record.active,
    autoRenewing: record.autoRenewing,
    expiresAt: record.expiresAt,
  };
  await prisma.storePurchase.upsert({
    where: { platform_purchaseKey: { platform: record.platform, purchaseKey: record.purchaseKey } },
    create: { tenantId, platform: record.platform, purchaseKey: record.purchaseKey, ...data },
    update: data,
  });
  await refreshStoreLicense(tenantId, moduleKey);
  return { tenantId, moduleKey, active: record.active, expiresAt: record.expiresAt?.toISOString() ?? null };
}
