export const IN_APP_PURCHASES = false;
export const STORE_NAME = "Web";

export interface StoreOffer {
  productId: string;
  displayPrice: string;
  freeTrial: string | null;
  offerToken: string | null;
}

export class PurchaseCancelled extends Error {}
export class PurchasePending extends Error {}

export function onStoreChange(_listener: () => void) {
  return () => undefined;
}

export async function loadOffer(_productId: string): Promise<StoreOffer | null> {
  return null;
}

export async function purchase(_offer: StoreOffer, _accountToken: string): Promise<void> {
  throw new Error("Acquisti in-app non disponibili sul web");
}

export async function syncPurchases(_options: { restore?: boolean } = {}) {
  return { restored: 0 };
}

export async function manageSubscriptions(_productId?: string) {}
