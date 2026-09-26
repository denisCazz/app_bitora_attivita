import { INVENTORY_MOVE_REASON, USAGE_WINDOW_DAYS, ingredientSchema, inventoryMoveSchema, isConsumption, roundQty } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { blankToNull, HttpError, must, num, parseBody } from "../errors";
import { prisma, tenantDb } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

const DAY = 24 * 60 * 60 * 1000;

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

function qtyText(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

function decimalOrNull(value: unknown) {
  return value == null ? null : num(value);
}

/** Where inventory lives when the caller does not pick a place: the first point of sale, else the first warehouse, else a new one. */
export async function inventoryLocation(tenant: string, requested?: string | null) {
  if (requested) return must(prisma.stockLocation.findFirst({ where: { id: requested, tenantId: tenant } }), "Ubicazione");
  for (const kind of ["POINT", "WAREHOUSE"] as const) {
    const found = await prisma.stockLocation.findFirst({ where: { tenantId: tenant, kind }, orderBy: { createdAt: "asc" } });
    if (found) return found;
  }
  return prisma.stockLocation.create({ data: { tenantId: tenant, name: "Magazzino", kind: "POINT" } });
}

type IngredientInput = Partial<z.infer<typeof ingredientSchema>>;

function ingredientData(body: IngredientInput) {
  const optional = (value: string | null | undefined) => (value === undefined ? undefined : blankToNull(value));
  return {
    name: body.name,
    unit: body.unit,
    sku: optional(body.sku),
    category: optional(body.category),
    barcode: optional(body.barcode),
    minQuantity: body.minQuantity,
    unitCost: body.unitCost,
    supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
  };
}

async function checkSupplier(tenant: string, supplierId: string | null | undefined) {
  if (supplierId) await must(tenantDb(tenant).supplier.findFirst({ where: { id: supplierId } }), "Fornitore");
}

export async function inventoryRoutes(app: FastifyInstance) {
  const readers = [app.requireTenant, permit("inventory.read"), moduleGuard("inventory")];
  const writers = [app.requireTenant, permit("inventory.write"), moduleGuard("inventory")];

  app.get("/inventory/locations", { preHandler: readers }, async (request) => {
    return tenantDb(tenantId(request)).stockLocation.findMany({ where: { kind: { in: ["POINT", "WAREHOUSE"] } }, orderBy: { createdAt: "asc" } });
  });

  app.get("/ingredients", { preHandler: readers }, async (request) => {
    const db = tenantDb(tenantId(request));
    const since = new Date(Date.now() - USAGE_WINDOW_DAYS * DAY);
    const [items, locations, balances, outflows] = await Promise.all([
      db.ingredient.findMany({ include: { supplier: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }),
      db.stockLocation.findMany({ select: { id: true, name: true } }),
      db.stockMovement.groupBy({ by: ["ingredientId", "locationId"], where: { ingredientId: { not: null } }, _sum: { quantity: true }, _max: { createdAt: true } }),
      db.stockMovement.findMany({ where: { ingredientId: { not: null }, createdAt: { gte: since }, quantity: { lt: 0 } }, select: { ingredientId: true, quantity: true, reason: true } }),
    ]);
    const locationName = new Map(locations.map((location) => [location.id, location.name]));
    const used = new Map<string, number>();
    for (const row of outflows) {
      const amount = num(row.quantity);
      if (!row.ingredientId || !isConsumption(amount, row.reason)) continue;
      used.set(row.ingredientId, (used.get(row.ingredientId) ?? 0) - amount);
    }
    const rowsOf = new Map<string, typeof balances>();
    for (const row of balances) {
      if (!row.ingredientId) continue;
      rowsOf.set(row.ingredientId, [...(rowsOf.get(row.ingredientId) ?? []), row]);
    }
    return items.map((item) => {
      const rows = rowsOf.get(item.id) ?? [];
      const byLocation = rows
        .map((row) => ({ locationId: row.locationId, name: locationName.get(row.locationId) ?? "", quantity: roundQty(num(row._sum.quantity)) }))
        .filter((row) => row.quantity !== 0);
      const last = rows.reduce<Date | null>((latest, row) => (row._max.createdAt && (!latest || row._max.createdAt > latest) ? row._max.createdAt : latest), null);
      return {
        ...item,
        minQuantity: decimalOrNull(item.minQuantity),
        unitCost: decimalOrNull(item.unitCost),
        quantity: roundQty(rows.reduce((sum, row) => sum + num(row._sum.quantity), 0)),
        byLocation,
        usedLast30: roundQty(used.get(item.id) ?? 0),
        lastMovementAt: last,
      };
    });
  });

  app.post("/ingredients", { preHandler: writers }, async (request) => {
    const body = parseBody(ingredientSchema, request.body);
    const tenant = tenantId(request);
    await checkSupplier(tenant, body.supplierId);
    const data = ingredientData(body);
    return tenantDb(tenant).ingredient.create({ data: { ...data, tenantId: tenant, name: body.name, unit: body.unit } });
  });

  app.patch("/ingredients/:id", { preHandler: writers }, async (request) => {
    const body = parseBody(ingredientSchema.partial(), request.body);
    const tenant = tenantId(request);
    const db = tenantDb(tenant);
    await must(db.ingredient.findFirst({ where: { id: idOf(request) } }), "Articolo");
    await checkSupplier(tenant, body.supplierId);
    return db.ingredient.update({ where: { id: idOf(request) }, data: ingredientData(body) });
  });

  app.delete("/ingredients/:id", { preHandler: writers }, async (request) => {
    const tenant = tenantId(request);
    const item = await must(tenantDb(tenant).ingredient.findFirst({ where: { id: idOf(request) } }), "Articolo");
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { tenantId: tenant, ingredientId: item.id } }),
      prisma.purchaseOrderLine.updateMany({ where: { tenantId: tenant, ingredientId: item.id }, data: { ingredientId: null } }),
      prisma.ingredient.delete({ where: { id: item.id } }),
    ]);
    return { ok: true };
  });

  app.get("/ingredients/:id/movements", { preHandler: readers }, async (request) => {
    const db = tenantDb(tenantId(request));
    const item = await must(db.ingredient.findFirst({ where: { id: idOf(request) } }), "Articolo");
    const rows = await db.stockMovement.findMany({
      where: { ingredientId: item.id },
      include: { location: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return rows.map((row) => ({ id: row.id, quantity: num(row.quantity), reason: row.reason, location: row.location.name, createdAt: row.createdAt }));
  });

  app.post("/ingredients/:id/movements", { preHandler: writers }, async (request) => {
    const body = parseBody(inventoryMoveSchema, request.body);
    const tenant = tenantId(request);
    const item = await must(tenantDb(tenant).ingredient.findFirst({ where: { id: idOf(request) } }), "Articolo");
    const location = await inventoryLocation(tenant, body.locationId);
    const note = blankToNull(body.note);
    const reason = `${INVENTORY_MOVE_REASON[body.kind]}${note ? `: ${note}` : ""}`;
    return prisma.$transaction(async (tx) => {
      const sum = await tx.stockMovement.aggregate({ where: { tenantId: tenant, ingredientId: item.id, locationId: location.id }, _sum: { quantity: true } });
      const current = roundQty(num(sum._sum.quantity));
      const amount = roundQty(body.quantity);
      let delta = amount;
      if (body.kind === "OUT" || body.kind === "WASTE") {
        if (amount > current + 0.0005) {
          throw new HttpError(409, `In ${location.name} ci sono solo ${qtyText(Math.max(current, 0))} ${item.unit}. Se non torna, fai la conta.`);
        }
        delta = -amount;
      }
      if (body.kind === "COUNT") delta = roundQty(amount - current);
      if (delta !== 0) {
        await tx.stockMovement.create({ data: { tenantId: tenant, ingredientId: item.id, locationId: location.id, quantity: delta, reason } });
      }
      if (body.kind === "IN" && body.unitCost != null) {
        await tx.ingredient.update({ where: { id: item.id }, data: { unitCost: body.unitCost } });
      }
      return { locationId: location.id, quantity: roundQty(current + delta), delta };
    });
  });
}
