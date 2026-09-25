import "../env";
import { PrismaClient } from "@prisma/client";
import { HttpError } from "../errors";

export const prisma = new PrismaClient();

const TENANT_MODELS = new Set([
  "Location",
  "Role",
  "Membership",
  "Invite",
  "TenantModule",
  "CustomFieldDef",
  "Customer",
  "Asset",
  "WorkOrder",
  "ChecklistTemplate",
  "ChecklistRun",
  "Attachment",
  "Schedule",
  "SparePart",
  "StockLocation",
  "StockMovement",
  "DiningTable",
  "MenuItem",
  "Modifier",
  "MenuItemModifier",
  "Order",
  "OrderLine",
  "Ingredient",
  "Recipe",
  "RecipeLine",
  "Supplier",
  "PurchaseOrder",
  "PurchaseOrderLine",
  "Shift",
  "Notification",
]);

const WHERE_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany"]);

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export function tenantDb(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const next = args as { data?: unknown; where?: Record<string, unknown> };
          if (operation === "create") {
            next.data = { ...(next.data as object), tenantId };
            return query(next);
          }
          if (operation === "createMany") {
            const data = next.data as Record<string, unknown>[];
            next.data = data.map((row) => ({ ...row, tenantId }));
            return query(next);
          }
          if (WHERE_OPS.has(operation)) {
            next.where = { ...(next.where ?? {}), tenantId };
            return query(next);
          }
          if (operation === "update" || operation === "delete" || operation === "findUnique" || operation === "findUniqueOrThrow") {
            const id = next.where?.id;
            if (typeof id === "string") {
              const delegate = (prisma as unknown as Record<string, { findFirst: (q: unknown) => Promise<{ tenantId?: string } | null> }>)[delegateName(model)];
              const existing = await delegate?.findFirst({ where: { id, tenantId }, select: { tenantId: true } });
              if (!existing) throw new HttpError(404, "Elemento non trovato");
            }
          }
          return query(args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
