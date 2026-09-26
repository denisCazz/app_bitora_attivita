import type { InventoryMove } from "./schemas";

export const INVENTORY_UNITS = ["pz", "kg", "g", "l", "ml", "conf", "bott"] as const;

export const INVENTORY_MOVE_REASON: Record<InventoryMove, string> = {
  IN: "Carico",
  OUT: "Consumo",
  WASTE: "Scarto",
  COUNT: "Inventario",
};

export const USAGE_WINDOW_DAYS = 30;

export type StockLevel = "out" | "low" | "ok";

export function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Senza scorta minima un articolo è solo "esaurito" o "ok". */
export function stockLevel(quantity: number, minQuantity: number | null | undefined): StockLevel {
  if (quantity <= 0) return "out";
  if (minQuantity != null && minQuantity > 0 && quantity <= minQuantity) return "low";
  return "ok";
}

/** Quanto ordinare per tornare al doppio della scorta minima. */
export function reorderQuantity(quantity: number, minQuantity: number | null | undefined) {
  if (minQuantity == null || minQuantity <= 0) return quantity <= 0 ? 1 : 0;
  if (quantity > minQuantity) return 0;
  const missing = minQuantity * 2 - Math.max(quantity, 0);
  return Math.ceil(roundQty(missing));
}

/** Giorni stimati prima di finire, dai consumi degli ultimi USAGE_WINDOW_DAYS giorni. */
export function daysLeft(quantity: number, usedInWindow: number) {
  if (quantity <= 0) return 0;
  if (usedInWindow <= 0) return null;
  return Math.floor(quantity / (usedInWindow / USAGE_WINDOW_DAYS));
}

/** Le uscite che contano come consumo: tutto il negativo tranne gli spostamenti tra ubicazioni. */
export function isConsumption(quantity: number, reason: string | null | undefined) {
  return quantity < 0 && !(reason ?? "").startsWith("Trasferimento");
}
