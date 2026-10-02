import type { ModuleKey } from "./modules";

export const TERMINOLOGY_KEYS = [
  "workOrder",
  "workOrders",
  "asset",
  "assets",
  "customer",
  "customers",
  "sparePart",
  "spareParts",
  "warehouse",
  "vehicle",
  "menu",
  "menuItem",
  "menuItems",
  "modifier",
  "modifiers",
  "inventory",
  "order",
  "orders",
] as const;

export type TermKey = (typeof TERMINOLOGY_KEYS)[number];
export type Terminology = Record<TermKey, string>;

export const BASE_TERMINOLOGY: Terminology = {
  workOrder: "Intervento",
  workOrders: "Interventi",
  asset: "Impianto",
  assets: "Impianti",
  customer: "Cliente",
  customers: "Clienti",
  sparePart: "Ricambio",
  spareParts: "Ricambi",
  warehouse: "Magazzino",
  vehicle: "Mezzo",
  menu: "Menu",
  menuItem: "Voce",
  menuItems: "Voci",
  modifier: "Variante",
  modifiers: "Varianti",
  inventory: "Scorte",
  order: "Comanda",
  orders: "Comande",
};

/** Modules named after a word of the trade: the word is the module name everywhere. */
export const MODULE_TERM: Partial<Record<ModuleKey, TermKey>> = {
  work_orders: "workOrders",
  assets: "assets",
  customers: "customers",
  spare_parts: "spareParts",
  menu: "menu",
  inventory: "inventory",
  orders: "orders",
};

export function moduleTermOf(key: string): TermKey | undefined {
  return MODULE_TERM[key as ModuleKey];
}

export const DEFAULT_ACCENT = "#2F6FED";

export function mergeTerminology(...layers: Array<Partial<Terminology> | null | undefined>): Terminology {
  const merged: Terminology = { ...BASE_TERMINOLOGY };
  for (const layer of layers) {
    for (const key of TERMINOLOGY_KEYS) {
      const value = layer?.[key];
      if (typeof value === "string" && value.trim()) merged[key] = value;
    }
  }
  return merged;
}
