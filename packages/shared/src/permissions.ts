export const PERMISSIONS = [
  "dashboard.view",
  "customers.read",
  "customers.write",
  "assets.read",
  "assets.write",
  "work_orders.read",
  "work_orders.write",
  "work_orders.assign",
  "checklists.read",
  "checklists.manage",
  "schedules.read",
  "schedules.write",
  "spare_parts.read",
  "spare_parts.write",
  "stock.read",
  "stock.adjust",
  "floor.read",
  "floor.write",
  "orders.read",
  "orders.write",
  "orders.void",
  "menu.read",
  "menu.write",
  "inventory.read",
  "inventory.write",
  "suppliers.read",
  "suppliers.write",
  "shifts.read",
  "shifts.write",
  "accounting.read",
  "accounting.write",
  "settings.manage",
  "team.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function hasPermission(permissions: readonly string[], required: Permission): boolean {
  return permissions.includes(required);
}

export function hasEveryPermission(permissions: readonly string[], required: readonly Permission[]): boolean {
  return required.every((permission) => hasPermission(permissions, permission));
}
