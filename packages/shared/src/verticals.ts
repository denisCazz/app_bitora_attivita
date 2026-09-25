export const TERMINOLOGY_KEYS = [
  "workOrder",
  "workOrders",
  "asset",
  "assets",
  "customer",
  "customers",
  "sparePart",
  "spareParts",
] as const;

export type Terminology = Record<(typeof TERMINOLOGY_KEYS)[number], string>;

export const BASE_TERMINOLOGY: Terminology = {
  workOrder: "Intervento",
  workOrders: "Interventi",
  asset: "Impianto",
  assets: "Impianti",
  customer: "Cliente",
  customers: "Clienti",
  sparePart: "Ricambio",
  spareParts: "Ricambi",
};

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
