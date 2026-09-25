import { sparePartSchema, stockAdjustSchema, stockTransferSchema } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { HttpError, must, num, parseBody } from "../errors";
import { prisma, tenantDb } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

export async function stoveRoutes(app: FastifyInstance) {
  app.get("/spare-parts", { preHandler: [app.requireTenant, permit("spare_parts.read"), moduleGuard("spare_parts")] }, async (request) => {
    const query = request.query as { q?: string; barcode?: string; model?: string };
    const db = tenantDb(tenantId(request));
    if (query.barcode) {
      const part = await db.sparePart.findFirst({ where: { barcode: query.barcode } });
      return part ? [part] : [];
    }
    const parts = await db.sparePart.findMany({ orderBy: { name: "asc" }, take: 200 });
    const q = query.q?.trim().toLowerCase();
    return parts.filter((part) => {
      const matchesQuery = !q || part.name.toLowerCase().includes(q) || part.sku.toLowerCase().includes(q);
      const matchesModel = !query.model || part.compatibleModels.some((model) => model.toLowerCase().includes(query.model!.toLowerCase()));
      return matchesQuery && matchesModel;
    });
  });

  app.post("/spare-parts", { preHandler: [app.requireTenant, permit("spare_parts.write"), moduleGuard("spare_parts")] }, async (request) => {
    const body = parseBody(sparePartSchema, request.body);
    const id = tenantId(request);
    try {
      return await tenantDb(id).sparePart.create({
        data: {
          tenantId: id,
          sku: body.sku,
          name: body.name,
          brand: body.brand || null,
          compatibleModels: body.compatibleModels,
          barcode: body.barcode || null,
          unitPrice: body.unitPrice,
        },
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new HttpError(409, "Questo codice è già in catalogo");
      }
      throw error;
    }
  });

  app.get("/stock/locations", { preHandler: [app.requireTenant, permit("stock.read"), moduleGuard("stock")] }, async (request) => {
    return tenantDb(tenantId(request)).stockLocation.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/stock/locations", { preHandler: [app.requireTenant, permit("stock.adjust"), moduleGuard("stock")] }, async (request) => {
    const body = request.body as { name?: string; kind?: "WAREHOUSE" | "VAN" | "KITCHEN" | "BAR" };
    if (!body.name || !body.kind) throw new HttpError(400, "Nome e tipo obbligatori");
    const id = tenantId(request);
    return tenantDb(id).stockLocation.create({ data: { tenantId: id, name: body.name, kind: body.kind } });
  });

  app.get("/stock/balances", { preHandler: [app.requireTenant, permit("stock.read")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    const [parts, ingredients, locations, grouped] = await Promise.all([
      db.sparePart.findMany(),
      db.ingredient.findMany(),
      db.stockLocation.findMany(),
      db.stockMovement.groupBy({ by: ["partId", "ingredientId", "locationId"], _sum: { quantity: true } }),
    ]);
    return grouped
      .map((row) => ({
        partId: row.partId,
        ingredientId: row.ingredientId,
        locationId: row.locationId,
        quantity: num(row._sum.quantity),
        part: parts.find((part) => part.id === row.partId) ?? null,
        ingredient: ingredients.find((ingredient) => ingredient.id === row.ingredientId) ?? null,
        location: locations.find((location) => location.id === row.locationId) ?? null,
      }))
      .filter((row) => row.quantity !== 0);
  });

  app.post("/stock/movements", { preHandler: [app.requireTenant, permit("stock.adjust")] }, async (request) => {
    const body = parseBody(stockAdjustSchema, request.body);
    if (!body.partId && !body.ingredientId) throw new HttpError(400, "Indica un ricambio o un ingrediente");
    const id = tenantId(request);
    const db = tenantDb(id);
    await must(db.stockLocation.findFirst({ where: { id: body.locationId } }), "Ubicazione");
    return db.stockMovement.create({
      data: {
        tenantId: id,
        partId: body.partId || null,
        ingredientId: body.ingredientId || null,
        locationId: body.locationId,
        quantity: body.quantity,
        reason: body.reason ?? null,
        workOrderId: body.workOrderId || null,
      },
    });
  });

  app.post("/stock/transfers", { preHandler: [app.requireTenant, permit("stock.adjust"), moduleGuard("stock")] }, async (request) => {
    const body = parseBody(stockTransferSchema, request.body);
    if (!body.partId && !body.ingredientId) throw new HttpError(400, "Indica un ricambio o un ingrediente");
    if (body.partId && body.ingredientId) throw new HttpError(400, "Indica un solo articolo");
    if (body.fromLocationId === body.toLocationId) throw new HttpError(400, "Origine e destinazione devono essere diverse");
    const quantity = Math.round(body.quantity * 1000) / 1000;
    if (!(quantity > 0)) throw new HttpError(400, "La quantità deve essere maggiore di zero");
    const id = tenantId(request);
    const [from, to] = await Promise.all([
      must(prisma.stockLocation.findFirst({ where: { id: body.fromLocationId, tenantId: id } }), "Ubicazione di origine"),
      must(prisma.stockLocation.findFirst({ where: { id: body.toLocationId, tenantId: id } }), "Ubicazione di destinazione"),
    ]);
    if (body.partId) await must(prisma.sparePart.findFirst({ where: { id: body.partId, tenantId: id } }), "Ricambio");
    if (body.ingredientId) await must(prisma.ingredient.findFirst({ where: { id: body.ingredientId, tenantId: id } }), "Ingrediente");
    const item = body.partId ? { partId: body.partId, ingredientId: null } : { partId: null, ingredientId: body.ingredientId! };
    const note = body.reason?.trim();
    return prisma.$transaction(async (tx) => {
      const sum = await tx.stockMovement.aggregate({
        where: { tenantId: id, locationId: from.id, ...item },
        _sum: { quantity: true },
      });
      const available = Math.round(num(sum._sum.quantity) * 1000) / 1000;
      if (quantity > available + 0.0005) {
        const label = Number.isInteger(available) ? String(available) : available.toLocaleString("it-IT", { maximumFractionDigits: 3 });
        throw new HttpError(409, `In ${from.name} ci sono solo ${label}`);
      }
      const out = await tx.stockMovement.create({
        data: {
          tenantId: id,
          ...item,
          locationId: from.id,
          quantity: -quantity,
          reason: `Trasferimento verso ${to.name}${note ? `: ${note}` : ""}`,
        },
      });
      const inn = await tx.stockMovement.create({
        data: {
          tenantId: id,
          ...item,
          locationId: to.id,
          quantity,
          reason: `Trasferimento da ${from.name}${note ? `: ${note}` : ""}`,
        },
      });
      return { from: out, to: inn };
    });
  });
}
