import { isModuleKey, type ModuleKey } from "./modules";

export type BillingSource = "STRIPE" | "APPLE" | "GOOGLE" | "DEMO";

const PRODUCT_PREFIX = "bitora_module_";

/** Same id on App Store Connect and Google Play Console: one auto-renewable monthly subscription per module. */
export function storeProductId(key: ModuleKey): string {
  return `${PRODUCT_PREFIX}${key}`;
}

export function moduleKeyOfProduct(productId: string): ModuleKey | null {
  if (!productId.startsWith(PRODUCT_PREFIX)) return null;
  const key = productId.slice(PRODUCT_PREFIX.length);
  return isModuleKey(key) ? key : null;
}

/** Stripe Checkout rejects a trial that ends less than 48 hours from now; the extra hour covers the time spent paying. */
const STRIPE_MIN_TRIAL_MS = 49 * 60 * 60 * 1000;

/** When a shop pays by card during a Bitora trial, the first charge waits for the trial end if Stripe allows it. */
export function stripeTrialEnd(trialEndsAt: Date | string | null | undefined, now = new Date()): Date | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  return end.getTime() - now.getTime() >= STRIPE_MIN_TRIAL_MS ? end : null;
}

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(".demo");
}
