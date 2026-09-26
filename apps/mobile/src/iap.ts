import type { ProductSubscription, Purchase, SubscriptionOffer } from "expo-iap";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api/client";

export const IN_APP_PURCHASES = true;
export const STORE_NAME = Platform.OS === "ios" ? "App Store" : "Google Play";

export interface StoreOffer {
  productId: string;
  displayPrice: string;
  freeTrial: string | null;
  offerToken: string | null;
}

export class PurchaseCancelled extends Error {
  constructor() {
    super("Acquisto annullato");
  }
}

export class PurchasePending extends Error {
  constructor() {
    super("Pagamento in attesa di conferma: il modulo si attiva appena il pagamento viene approvato.");
  }
}

type Iap = typeof import("expo-iap");
type Waiter = { resolve: () => void; reject: (error: Error) => void };
const waiters = new Map<string, Waiter>();
const changeListeners = new Set<() => void>();
let connection: Promise<Iap> | null = null;

function settle(productId: string, error?: Error) {
  const waiter = waiters.get(productId);
  waiters.delete(productId);
  if (error) waiter?.reject(error);
  else waiter?.resolve();
}

async function onPurchase(iap: Iap, purchase: Purchase) {
  if (purchase.purchaseState === "pending") {
    settle(purchase.productId, new PurchasePending());
    return;
  }
  try {
    if (!purchase.purchaseToken) throw new Error("Ricevuta mancante");
    await api("POST", "/billing/store/verify", { platform: Platform.OS, productId: purchase.productId, purchaseToken: purchase.purchaseToken }, { force: true });
    await iap.finishTransaction({ purchase, isConsumable: false });
    settle(purchase.productId);
  } catch (error) {
    settle(purchase.productId, error instanceof Error ? error : new Error("Verifica dell'acquisto non riuscita"));
  } finally {
    for (const listener of changeListeners) listener();
  }
}

/** Expo Go has no StoreKit / Play Billing module: purchases need a development or store build. */
function connect(): Promise<Iap> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return Promise.reject(new Error("Gli acquisti in-app funzionano solo nella build di sviluppo o nell'app scaricata dallo store, non in Expo Go."));
  }
  connection ??= import("expo-iap")
    .then(async (iap) => {
      await iap.initConnection();
      iap.purchaseUpdatedListener((purchase) => void onPurchase(iap, purchase));
      iap.purchaseErrorListener((error) => {
        const reason = iap.isUserCancelledError(error) ? new PurchaseCancelled() : new Error(error.message || "Acquisto non riuscito");
        if (error.productId) settle(error.productId, reason);
        else for (const productId of [...waiters.keys()]) settle(productId, reason);
      });
      return iap;
    })
    .catch((error: unknown) => {
      connection = null;
      throw new Error(error instanceof Error && error.message ? `${STORE_NAME} non disponibile: ${error.message}` : `${STORE_NAME} non disponibile`);
    });
  return connection;
}

export function onStoreChange(listener: () => void) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function periodLabel(offer: SubscriptionOffer) {
  const count = (offer.period?.value ?? 1) * (offer.periodCount ?? 1);
  const names: Record<string, [string, string]> = { day: ["giorno", "giorni"], week: ["settimana", "settimane"], month: ["mese", "mesi"], year: ["anno", "anni"] };
  const [one, many] = names[offer.period?.unit ?? "day"] ?? ["giorno", "giorni"];
  return `${count} ${count === 1 ? one : many}`;
}

export async function loadOffer(productId: string): Promise<StoreOffer | null> {
  const iap = await connect();
  const products = (await iap.fetchProducts({ skus: [productId], type: "subs" })) as ProductSubscription[] | null;
  const product = products?.find((item) => item.id === productId);
  if (!product) return null;
  const offers = product.subscriptionOffers ?? [];
  const trial = offers.find((offer) => offer.paymentMode === "free-trial");
  const chosen = trial ?? offers.find((offer) => offer.paymentMode !== "free-trial") ?? offers[0];
  return {
    productId,
    displayPrice: product.displayPrice,
    freeTrial: trial ? periodLabel(trial) : null,
    offerToken: chosen?.offerTokenAndroid ?? null,
  };
}

export async function purchase(offer: StoreOffer, accountToken: string) {
  const iap = await connect();
  if (waiters.has(offer.productId)) throw new Error("Acquisto già in corso");
  const done = new Promise<void>((resolve, reject) => waiters.set(offer.productId, { resolve, reject }));
  try {
    await iap.requestPurchase({
      type: "subs",
      request: {
        apple: { sku: offer.productId, appAccountToken: accountToken },
        google: {
          skus: [offer.productId],
          obfuscatedAccountId: accountToken,
          subscriptionOffers: offer.offerToken ? [{ sku: offer.productId, offerToken: offer.offerToken }] : undefined,
        },
      },
    });
  } catch (error) {
    settle(offer.productId, iap.isUserCancelledError(error) ? new PurchaseCancelled() : error instanceof Error ? error : new Error("Acquisto non riuscito"));
  }
  return done;
}

/** Sends every purchase the store still holds to the server and finishes the ones it accepts. */
export async function syncPurchases(options: { restore?: boolean } = {}) {
  const iap = await connect();
  if (options.restore) await iap.restorePurchases();
  const purchases = (await iap.getAvailablePurchases()).filter((item) => item.productId.startsWith("bitora_module_") && item.purchaseToken);
  if (!purchases.length) return { restored: 0 };
  const { results } = await api<{ results: Array<{ productId: string; ok: boolean; active?: boolean }> }>(
    "POST",
    "/billing/store/sync",
    { purchases: purchases.map((item) => ({ platform: Platform.OS, productId: item.productId, purchaseToken: item.purchaseToken })) },
    { force: true },
  );
  for (const item of purchases) {
    if (results.find((result) => result.productId === item.productId)?.ok) await iap.finishTransaction({ purchase: item, isConsumable: false }).catch(() => undefined);
  }
  return { restored: results.filter((result) => result.ok && result.active).length };
}

export async function manageSubscriptions(productId?: string) {
  const iap = await connect();
  await iap.deepLinkToSubscriptions({ skuAndroid: productId, packageNameAndroid: Constants.expoConfig?.android?.package });
}
