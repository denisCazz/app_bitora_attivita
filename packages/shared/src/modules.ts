import type { Permission } from "./permissions";

export const STOCK_LOCATION_KINDS = ["WAREHOUSE", "MOBILE", "POINT"] as const;
export type StockLocationKind = (typeof STOCK_LOCATION_KINDS)[number];

export const MODULE_KEYS = [
  "dashboard",
  "work_orders",
  "customers",
  "assets",
  "calendar",
  "spare_parts",
  "stock",
  "checklists",
  "floor",
  "orders",
  "menu",
  "inventory",
  "suppliers",
  "shifts",
  "accounting",
  "settings",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleCode {
  route: string;
  permission: Permission;
}

export const MODULE_CODE: Record<ModuleKey, ModuleCode> = {
  dashboard: { route: "/", permission: "dashboard.view" },
  work_orders: { route: "/work-orders", permission: "work_orders.read" },
  customers: { route: "/customers", permission: "customers.read" },
  assets: { route: "/assets", permission: "assets.read" },
  calendar: { route: "/calendar", permission: "schedules.read" },
  spare_parts: { route: "/parts", permission: "spare_parts.read" },
  stock: { route: "/stock", permission: "stock.read" },
  checklists: { route: "/checklists", permission: "checklists.read" },
  floor: { route: "/floor", permission: "floor.read" },
  orders: { route: "/orders", permission: "orders.read" },
  menu: { route: "/menu", permission: "menu.read" },
  inventory: { route: "/inventory", permission: "inventory.read" },
  suppliers: { route: "/suppliers", permission: "suppliers.read" },
  shifts: { route: "/shifts", permission: "shifts.read" },
  accounting: { route: "/accounting", permission: "accounting.read" },
  settings: { route: "/settings", permission: "settings.manage" },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
