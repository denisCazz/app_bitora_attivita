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

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(".demo");
}

/** The paid module a demo shop keeps locked so the real purchase flow can be tested. */
export function demoTestModule<T extends { key: ModuleKey; free: boolean; priceCents: number; sortOrder: number }>(modules: readonly T[]): T | null {
  const paid = modules.filter((module) => !module.free && module.priceCents > 0);
  return [...paid].sort((a, b) => a.priceCents - b.priceCents || a.sortOrder - b.sortOrder)[0] ?? null;
}
