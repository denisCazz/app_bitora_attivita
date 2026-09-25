import {
  closeOrderSchema,
  ingredientSchema,
  menuItemSchema,
  modifierSchema,
  orderLineSchema,
  purchaseOrderSchema,
  recipeSchema,
  shiftSchema,
  supplierSchema,
  tableSchema,
} from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { blankToNull, HttpError, must, num, parseBody } from "../errors";
import { prisma, tenantDb } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

export async function hospitalityRoutes(app: FastifyInstance) {
  app.get("/tables", { preHandler: [app.requireTenant, permit("floor.read"), moduleGuard("floor")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    const tables = await db.diningTable.findMany({ orderBy: { name: "asc" } });
    const orders = await db.order.findMany({ where: { status: { in: ["OPEN", "SENT", "PARTIAL"] } }, include: { lines: true } });
    return tables.map((table) => ({ ...table, openOrder: orders.find((order) => order.tableId === table.id) ?? null }));
  });

  app.post("/tables", { preHandler: [app.requireTenant, permit("floor.write"), moduleGuard("floor")] }, async (request) => {
    const body = parseBody(tableSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).diningTable.create({
      data: { tenantId: id, name: body.name, seats: body.seats ?? 2, posX: body.posX ?? 0.1, posY: body.posY ?? 0.1, locationId: body.locationId || null },
    });
  });

  app.patch("/tables/:id", { preHandler: [app.requireTenant, permit("floor.write"), moduleGuard("floor")] }, async (request) => {
    const body = parseBody(tableSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.diningTable.findFirst({ where: { id: idOf(request) } }), "Tavolo");
    return db.diningTable.update({ where: { id: idOf(request) }, data: body });
  });

  app.delete("/tables/:id", { preHandler: [app.requireTenant, permit("floor.write"), moduleGuard("floor")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.diningTable.findFirst({ where: { id: idOf(request) } }), "Tavolo");
    await db.diningTable.delete({ where: { id: idOf(request) } }).catch(() => {
      throw new HttpError(409, "Il tavolo ha comande collegate");
    });
    return { ok: true };
  });

  app.get("/menu-items", { preHandler: [app.requireTenant, permit("menu.read"), moduleGuard("menu")] }, async (request) => {
    return tenantDb(tenantId(request)).menuItem.findMany({ include: { modifiers: { include: { modifier: true } }, recipe: { include: { lines: true } } }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  });

  app.post("/menu-items", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const body = parseBody(menuItemSchema, request.body);
    const id = tenantId(request);
    const item = await tenantDb(id).menuItem.create({
      data: { tenantId: id, name: body.name, category: body.category, station: body.station ?? "KITCHEN", price: body.price, available: body.available ?? true, customFields: body.customFields ?? {} },
    });
    if (body.modifierIds?.length) {
      await tenantDb(id).menuItemModifier.createMany({
        data: body.modifierIds.map((modifierId) => ({ tenantId: id, menuItemId: item.id, modifierId })),
      });
    }
    return item;
  });

  app.patch("/menu-items/:id", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const body = parseBody(menuItemSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.menuItem.findFirst({ where: { id: idOf(request) } }), "Piatto");
    return db.menuItem.update({ where: { id: idOf(request) }, data: { name: body.name, category: body.category, station: body.station, price: body.price, available: body.available, customFields: body.customFields } });
  });

  app.get("/modifiers", { preHandler: [app.requireTenant, permit("menu.read"), moduleGuard("menu")] }, async (request) => {
    return tenantDb(tenantId(request)).modifier.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/modifiers", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const body = parseBody(modifierSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).modifier.create({ data: { tenantId: id, name: body.name, priceDelta: body.priceDelta } });
  });

  app.get("/orders", { preHandler: [app.requireTenant, permit("orders.read"), moduleGuard("orders")] }, async (request) => {
    const status = (request.query as { status?: "OPEN" | "SENT" | "PARTIAL" | "CLOSED" | "VOID" }).status;
    return tenantDb(tenantId(request)).order.findMany({
      where: status ? { status } : { status: { in: ["OPEN", "SENT", "PARTIAL"] } },
      include: { lines: true, table: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  });

  app.post("/orders", { preHandler: [app.requireTenant, permit("orders.write"), moduleGuard("orders")] }, async (request) => {
    const body = request.body as { tableId?: string; covers?: number; notes?: string };
    const id = tenantId(request);
    return tenantDb(id).order.create({
      data: { tenantId: id, tableId: body.tableId || null, covers: body.covers ?? 1, notes: body.notes ?? null, status: "OPEN" },
      include: { lines: true, table: true },
    });
  });

  app.get("/orders/:id", { preHandler: [app.requireTenant, permit("orders.read"), moduleGuard("orders")] }, async (request) => {
    return must(tenantDb(tenantId(request)).order.findFirst({ where: { id: idOf(request) }, include: { lines: true, table: true } }), "Comanda");
  });

  app.post("/orders/:id/lines", { preHandler: [app.requireTenant, permit("orders.write"), moduleGuard("orders")] }, async (request) => {
    const body = parseBody(orderLineSchema, request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    const order = await must(db.order.findFirst({ where: { id: idOf(request) } }), "Comanda");
    if (order.status === "CLOSED" || order.status === "VOID") throw new HttpError(409, "Comanda chiusa");
    let name = body.name?.trim() ?? "";
    let station: "BAR" | "KITCHEN" | "OTHER" = body.station ?? "KITCHEN";
    let unitPrice = body.unitPrice ?? 0;
    let modifiers: Array<{ id: string; name: string; priceDelta: number }> = [];
    let menuItemId: string | null = null;
    if (body.menuItemId) {
      const item = await must(db.menuItem.findFirst({ where: { id: body.menuItemId } }), "Piatto");
      const modifierIds = body.modifierIds ?? [];
      const rows = modifierIds.length ? await db.modifier.findMany({ where: { id: { in: modifierIds } } }) : [];
      menuItemId = item.id;
      name = item.name;
      station = item.station;
      unitPrice = num(item.price) + rows.reduce((sum, modifier) => sum + num(modifier.priceDelta), 0);
      modifiers = rows.map((modifier) => ({ id: modifier.id, name: modifier.name, priceDelta: num(modifier.priceDelta) }));
    }
    const line = await db.orderLine.create({
      data: {
        tenantId: id,
        orderId: order.id,
        menuItemId,
        name,
        station,
        quantity: body.quantity,
        unitPrice,
        modifiers,
        note: blankToNull(body.note),
        status: "PENDING",
      },
    });
    if (order.status === "OPEN") await db.order.update({ where: { id: order.id }, data: { status: "PARTIAL" } });
    return line;
  });

  app.post("/orders/:id/send", { preHandler: [app.requireTenant, permit("orders.write"), moduleGuard("orders")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    const order = await must(db.order.findFirst({ where: { id: idOf(request) } }), "Comanda");
    await db.orderLine.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "SENT" } });
    return db.order.update({ where: { id: order.id }, data: { status: "SENT" }, include: { lines: true, table: true } });
  });

  app.patch("/orders/:id/lines/:lineId", { preHandler: [app.requireTenant, permit("orders.write"), moduleGuard("orders")] }, async (request) => {
    const params = request.params as { id: string; lineId: string };
    const status = (request.body as { status?: "PENDING" | "SENT" | "READY" | "SERVED" | "VOID" }).status;
    if (!status) throw new HttpError(400, "Stato mancante");
    const db = tenantDb(tenantId(request));
    const line = await must(db.orderLine.findFirst({ where: { id: params.lineId, orderId: params.id } }), "Riga");
    return db.orderLine.update({ where: { id: line.id }, data: { status } });
  });

  app.post("/orders/:id/close", { preHandler: [app.requireTenant, permit("orders.write"), moduleGuard("orders")] }, async (request) => {
    const body = parseBody(closeOrderSchema, request.body);
    const id = tenantId(request);
    const order = await must(prisma.order.findFirst({ where: { id: idOf(request), tenantId: id }, include: { lines: true } }), "Comanda");
    if (order.status === "CLOSED" || order.status === "VOID") throw new HttpError(409, "Comanda già chiusa");
    const total = order.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + num(line.unitPrice) * line.quantity, 0);
    const paid = body.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.abs(paid - total) > 0.05) throw new HttpError(400, `Il conto è ${total.toFixed(2)} €, ricevuto ${paid.toFixed(2)} €`);
    const kitchen = await prisma.stockLocation.findFirst({ where: { tenantId: id, kind: "KITCHEN" } });
    await prisma.$transaction(async (tx) => {
      if (kitchen) {
        for (const line of order.lines) {
          if (line.status === "VOID" || !line.menuItemId) continue;
          const recipe = await tx.recipe.findUnique({ where: { menuItemId: line.menuItemId }, include: { lines: true } });
          if (!recipe) continue;
          for (const ingredient of recipe.lines) {
            await tx.stockMovement.create({
              data: {
                tenantId: id,
                ingredientId: ingredient.ingredientId,
                locationId: kitchen.id,
                quantity: -num(ingredient.quantity) * line.quantity,
                reason: `Scarico comanda`,
                orderId: order.id,
              },
            });
          }
        }
      }
      await tx.order.update({ where: { id: order.id }, data: { status: "CLOSED", closedAt: new Date(), payments: body.payments } });
      await tx.orderLine.updateMany({ where: { orderId: order.id, status: { not: "VOID" } }, data: { status: "SERVED" } });
    });
    return prisma.order.findFirst({ where: { id: order.id }, include: { lines: true, table: true } });
  });

  app.post("/orders/:id/void", { preHandler: [app.requireTenant, permit("orders.void"), moduleGuard("orders")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    const order = await must(db.order.findFirst({ where: { id: idOf(request) } }), "Comanda");
    if (order.status === "CLOSED") throw new HttpError(409, "Una comanda chiusa non si annulla");
    await db.orderLine.updateMany({ where: { orderId: order.id }, data: { status: "VOID" } });
    return db.order.update({ where: { id: order.id }, data: { status: "VOID" } });
  });

  app.get("/ingredients", { preHandler: [app.requireTenant, permit("inventory.read"), moduleGuard("inventory")] }, async (request) => {
    return tenantDb(tenantId(request)).ingredient.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/ingredients", { preHandler: [app.requireTenant, permit("inventory.write"), moduleGuard("inventory")] }, async (request) => {
    const body = parseBody(ingredientSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).ingredient.create({ data: { tenantId: id, name: body.name, unit: body.unit, sku: blankToNull(body.sku) } });
  });

  app.put("/recipes", { preHandler: [app.requireTenant, permit("inventory.write"), moduleGuard("inventory")] }, async (request) => {
    const body = parseBody(recipeSchema, request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    await must(db.menuItem.findFirst({ where: { id: body.menuItemId } }), "Piatto");
    const existing = await db.recipe.findFirst({ where: { menuItemId: body.menuItemId } });
    if (existing) await db.recipe.delete({ where: { id: existing.id } });
    const recipe = await db.recipe.create({ data: { tenantId: id, menuItemId: body.menuItemId } });
    await db.recipeLine.createMany({
      data: body.lines.map((line) => ({ tenantId: id, recipeId: recipe.id, ingredientId: line.ingredientId, quantity: line.quantity })),
    });
    return db.recipe.findFirst({ where: { id: recipe.id }, include: { lines: true } });
  });

  app.get("/suppliers", { preHandler: [app.requireTenant, permit("suppliers.read"), moduleGuard("suppliers")] }, async (request) => {
    return tenantDb(tenantId(request)).supplier.findMany({ include: { orders: { include: { lines: true }, orderBy: { createdAt: "desc" }, take: 5 } }, orderBy: { name: "asc" } });
  });

  app.post("/suppliers", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const body = parseBody(supplierSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).supplier.create({ data: { tenantId: id, name: body.name, email: blankToNull(body.email), phone: blankToNull(body.phone), notes: blankToNull(body.notes) } });
  });

  app.post("/purchase-orders", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const body = parseBody(purchaseOrderSchema, request.body);
    const id = tenantId(request);
    const order = await tenantDb(id).purchaseOrder.create({ data: { tenantId: id, supplierId: body.supplierId, status: "SENT" } });
    await tenantDb(id).purchaseOrderLine.createMany({
      data: body.lines.map((line) => ({ tenantId: id, orderId: order.id, ingredientId: line.ingredientId || null, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
    });
    return tenantDb(id).purchaseOrder.findFirst({ where: { id: order.id }, include: { lines: true, supplier: true } });
  });

  app.post("/purchase-orders/:id/receive", { preHandler: [app.requireTenant, permit("inventory.write"), moduleGuard("suppliers")] }, async (request) => {
    const locationId = (request.body as { locationId?: string }).locationId;
    if (!locationId) throw new HttpError(400, "Ubicazione mancante");
    const id = tenantId(request);
    const db = tenantDb(id);
    const order = await must(db.purchaseOrder.findFirst({ where: { id: idOf(request) }, include: { lines: true } }), "Ordine");
    if (order.status === "RECEIVED") throw new HttpError(409, "Ordine già ricevuto");
    await prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        if (!line.ingredientId) continue;
        await tx.stockMovement.create({
          data: { tenantId: id, ingredientId: line.ingredientId, locationId, quantity: line.quantity, reason: "Ricezione ordine fornitore" },
        });
      }
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "RECEIVED" } });
    });
    return db.purchaseOrder.findFirst({ where: { id: order.id }, include: { lines: true } });
  });

  app.get("/shifts", { preHandler: [app.requireTenant, permit("shifts.read"), moduleGuard("shifts")] }, async (request) => {
    return tenantDb(tenantId(request)).shift.findMany({ include: { user: { select: { id: true, name: true } } }, orderBy: { startsAt: "asc" }, take: 100 });
  });

  app.post("/shifts", { preHandler: [app.requireTenant, permit("shifts.write"), moduleGuard("shifts")] }, async (request) => {
    const body = parseBody(shiftSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).shift.create({
      data: { tenantId: id, userId: body.userId, roleLabel: blankToNull(body.roleLabel), startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), status: body.status ?? "PLANNED" },
    });
  });

  app.patch("/shifts/:id", { preHandler: [app.requireTenant, permit("shifts.write"), moduleGuard("shifts")] }, async (request) => {
    const body = parseBody(shiftSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.shift.findFirst({ where: { id: idOf(request) } }), "Turno");
    return db.shift.update({
      where: { id: idOf(request) },
      data: {
        userId: body.userId,
        roleLabel: body.roleLabel,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        status: body.status,
      },
    });
  });
}
