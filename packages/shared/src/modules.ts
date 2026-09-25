import type { Permission } from "./permissions";

export const VERTICALS = ["FIELD_SERVICE", "HOSPITALITY"] as const;
export type Vertical = (typeof VERTICALS)[number];

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
  settings: { route: "/settings", permission: "settings.manage" },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
