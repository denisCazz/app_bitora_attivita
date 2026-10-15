import { Platform } from "react-native";

export const IN_APP_PURCHASES = false;
export const STORE_NAME = Platform.OS === "ios" ? "App Store" : Platform.OS === "android" ? "Google Play" : "Web";

export interface StoreOffer {
  productId: string;
  displayPrice: string;
  freeTrial: string | null;
  introPrice: string | null;
  offerToken: string | null;
}

export class PurchaseCancelled extends Error {
  constructor() {
    super("Acquisto annullato");
  }
}

export class PurchasePending extends Error {
  constructor() {
    super("Pagamento in attesa di conferma.");
  }
}

export function onStoreChange(_listener: () => void) {
  return () => undefined;
}

export async function loadOffers(_productIds: string[]): Promise<Record<string, StoreOffer>> {
  return {};
}

export async function purchase(_offer: StoreOffer, _accountToken: string): Promise<void> {
  throw new Error("Acquisti in-app non attivi");
}

export async function syncPurchases(_options: { restore?: boolean } = {}) {
  return { restored: 0 };
}

export async function manageSubscriptions(_productId?: string) {}
