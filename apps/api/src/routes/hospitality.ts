import {
  closeOrderSchema,
  menuApplySchema,
  menuItemSchema,
  menuSourceSchema,
  modifierSchema,
  orderLineSchema,
  purchaseOrderSchema,
  sendOrderSchema,
  shiftSchema,
  supplierSchema,
  publicHttpUrl,
  tableSchema,
} from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { blankToNull, HttpError, must, num, parseBody } from "../errors";
import { assertAiConsent } from "../lib/assistant/consent";
import { categoryOfTenant } from "../lib/catalog";
import { applyMenuImport, menuSourceUrl, previewMenuImport } from "../lib/menu-import";
import { refreshPayrollForShifts } from "../lib/payroll";
import { prisma, tenantDb } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";
import { inventoryLocation } from "./inventory";

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

function siteUrl(value: string): string {
  try {
    return publicHttpUrl(value).toString();
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Indirizzo non valido");
  }
}

function supplierFields(body: {
  vat?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}) {
  return {
    vat: blankToNull(body.vat),
    contactName: blankToNull(body.contactName),
    email: blankToNull(body.email),
    phone: blankToNull(body.phone),
    address: blankToNull(body.address),
    city: blankToNull(body.city),
    paymentTerms: blankToNull(body.paymentTerms),
    notes: blankToNull(body.notes),
  };
}

async function stationFor(tenant: string, requested: string | undefined): Promise<string> {
  const { stations } = (await categoryOfTenant(tenant)).vocab;
  if (!requested) return stations[0]!.key;
  if (!stations.some((station) => station.key === requested)) throw new HttpError(400, "Reparto non valido");
  return requested;
}

type LineInput = { menuItemId?: string | null; name?: string; unitPrice?: number; station?: string; quantity?: number; modifierIds?: string[]; note?: string | null };

async function lineData(tenant: string, orderId: string, body: LineInput) {
  const db = tenantDb(tenant);
  let name = body.name?.trim() ?? "";
  let station = await stationFor(tenant, body.station);
  let unitPrice = body.unitPrice ?? 0;
  let modifiers: Array<{ id: string; name: string; priceDelta: number }> = [];
  let menuItemId: string | null = null;
  if (body.menuItemId) {
    const item = await must(db.menuItem.findFirst({ where: { id: body.menuItemId } }), "Piatto");
    if (!item.available) throw new HttpError(409, `${item.name} non è disponibile`);
    const modifierIds = body.modifierIds ?? [];
    const rows = modifierIds.length ? await db.modifier.findMany({ where: { id: { in: modifierIds } } }) : [];
    menuItemId = item.id;
    name = item.name;
    station = item.station;
    unitPrice = num(item.price) + rows.reduce((sum, modifier) => sum + num(modifier.priceDelta), 0);
    modifiers = rows.map((modifier) => ({ id: modifier.id, name: modifier.name, priceDelta: num(modifier.priceDelta) }));
  }
  return { tenantId: tenant, orderId, menuItemId, name, station, quantity: body.quantity ?? 1, unitPrice, modifiers, note: blankToNull(body.note), status: "SENT" as const };
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
    return tenantDb(tenantId(request)).menuItem.findMany({ include: { modifiers: { include: { modifier: true } } }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  });

  app.post("/menu-items", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const body = parseBody(menuItemSchema, request.body);
    const id = tenantId(request);
    const station = await stationFor(id, body.station);
    const item = await tenantDb(id).menuItem.create({
      data: { tenantId: id, name: body.name, category: body.category, station, price: body.price, available: body.available ?? true, customFields: body.customFields ?? {} },
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
    const id = tenantId(request);
    const itemId = idOf(request);
    const db = tenantDb(id);
    await must(db.menuItem.findFirst({ where: { id: itemId } }), "Piatto");
    const station = body.station === undefined ? undefined : await stationFor(id, body.station);
    if (body.modifierIds) {
      const modifierIds = [...new Set(body.modifierIds)];
      const found = await db.modifier.findMany({ where: { id: { in: modifierIds } }, select: { id: true } });
      if (found.length !== modifierIds.length) throw new HttpError(400, "Variante non trovata");
      await db.menuItemModifier.deleteMany({ where: { menuItemId: itemId } });
      if (modifierIds.length) {
        await db.menuItemModifier.createMany({ data: modifierIds.map((modifierId) => ({ tenantId: id, menuItemId: itemId, modifierId })) });
      }
    }
    return db.menuItem.update({ where: { id: itemId }, data: { name: body.name, category: body.category, station, price: body.price, available: body.available, customFields: body.customFields } });
  });

  app.delete("/menu-items/:id", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const itemId = idOf(request);
    const db = tenantDb(tenantId(request));
    await must(db.menuItem.findFirst({ where: { id: itemId } }), "Piatto");
    await db.orderLine.updateMany({ where: { menuItemId: itemId }, data: { menuItemId: null } });
    await db.menuItem.delete({ where: { id: itemId } });
    return { ok: true };
  });

  app.get("/modifiers", { preHandler: [app.requireTenant, permit("menu.read"), moduleGuard("menu")] }, async (request) => {
    return tenantDb(tenantId(request)).modifier.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/modifiers", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const body = parseBody(modifierSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).modifier.create({ data: { tenantId: id, name: body.name, priceDelta: body.priceDelta } });
  });

  app.delete("/modifiers/:id", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.modifier.findFirst({ where: { id: idOf(request) } }), "Variante");
    await db.modifier.delete({ where: { id: idOf(request) } });
    return { ok: true };
  });

  app.get("/menu-source", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId(request) }, select: { settings: true } });
    return { url: menuSourceUrl(tenant?.settings) };
  });

  app.post("/menu-import", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    await assertAiConsent(request.auth!.userId);
    const body = parseBody(menuSourceSchema, request.body);
    return previewMenuImport(tenantId(request), siteUrl(body.url));
  });

  app.post("/menu-import/apply", { preHandler: [app.requireTenant, permit("menu.write"), moduleGuard("menu")] }, async (request) => {
    const body = parseBody(menuApplySchema, request.body);
    return applyMenuImport(tenantId(request), { ...body, url: siteUrl(body.url) });
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
    const line = await db.orderLine.create({ data: await lineData(id, order.id, body) });
    const pending = await db.orderLine.count({ where: { orderId: order.id, status: "PENDING" } });
    await db.order.update({ where: { id: order.id }, data: { status: pending > 0 ? "PARTIAL" : "SENT" } });
    return line;
  });

  app.post("/orders/:id/send", { preHandler: [app.requireTenant, permit("orders.write"), moduleGuard("orders")] }, async (request) => {
    const body = parseBody(sendOrderSchema, request.body ?? {});
    const id = tenantId(request);
    const db = tenantDb(id);
    const order = await must(db.order.findFirst({ where: { id: idOf(request) } }), "Comanda");
    if (order.status === "CLOSED" || order.status === "VOID") throw new HttpError(409, "Comanda chiusa");
    const rows = [];
    for (const line of body.lines ?? []) rows.push(await lineData(id, order.id, line));
    if (rows.length) await db.orderLine.createMany({ data: rows });
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
    await prisma.$transaction(async (tx) => {
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

  app.get("/suppliers", { preHandler: [app.requireTenant, permit("suppliers.read"), moduleGuard("suppliers")] }, async (request) => {
    const q = ((request.query as { q?: string }).q ?? "").trim().slice(0, 80);
    const db = tenantDb(tenantId(request));
    const [rows, counts] = await Promise.all([
      db.supplier.findMany({
        where: q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { vat: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        include: {
          _count: { select: { ingredients: true } },
          orders: { include: { lines: true }, orderBy: { createdAt: "desc" }, take: 5 },
        },
        orderBy: { name: "asc" },
        take: 100,
      }),
      db.purchaseOrder.groupBy({ by: ["supplierId", "status"], _count: { _all: true } }),
    ]);
    const openOf = new Map<string, number>();
    for (const row of counts) {
      if (row.status !== "DRAFT" && row.status !== "SENT") continue;
      openOf.set(row.supplierId, (openOf.get(row.supplierId) ?? 0) + row._count._all);
    }
    return rows.map((supplier) => ({ ...supplier, openOrders: openOf.get(supplier.id) ?? 0 }));
  });

  app.get("/suppliers/:id", { preHandler: [app.requireTenant, permit("suppliers.read"), moduleGuard("suppliers")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    return must(
      db.supplier.findFirst({
        where: { id: idOf(request) },
        include: {
          ingredients: { orderBy: { name: "asc" } },
          orders: {
            include: { lines: { include: { ingredient: { select: { id: true, name: true, unit: true } } } } },
            orderBy: { createdAt: "desc" },
            take: 80,
          },
          ledgerEntries: { orderBy: { date: "desc" }, take: 40 },
        },
      }),
      "Fornitore",
    );
  });

  app.post("/suppliers", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const body = parseBody(supplierSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).supplier.create({ data: { tenantId: id, name: body.name, ...supplierFields(body) } });
  });

  app.patch("/suppliers/:id", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const body = parseBody(supplierSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.supplier.findFirst({ where: { id: idOf(request) } }), "Fornitore");
    return db.supplier.update({
      where: { id: idOf(request) },
      data: {
        name: body.name,
        vat: body.vat === undefined ? undefined : blankToNull(body.vat),
        contactName: body.contactName === undefined ? undefined : blankToNull(body.contactName),
        email: body.email === undefined ? undefined : blankToNull(body.email),
        phone: body.phone === undefined ? undefined : blankToNull(body.phone),
        address: body.address === undefined ? undefined : blankToNull(body.address),
        city: body.city === undefined ? undefined : blankToNull(body.city),
        paymentTerms: body.paymentTerms === undefined ? undefined : blankToNull(body.paymentTerms),
        notes: body.notes === undefined ? undefined : blankToNull(body.notes),
      },
    });
  });

  app.delete("/suppliers/:id", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    const supplier = await must(db.supplier.findFirst({ where: { id: idOf(request) } }), "Fornitore");
    const orders = await db.purchaseOrder.count({ where: { supplierId: supplier.id } });
    if (orders > 0) throw new HttpError(409, "Il fornitore ha ordini collegati");
    await db.supplier.delete({ where: { id: supplier.id } });
    return { ok: true };
  });

  app.post("/purchase-orders", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const body = parseBody(purchaseOrderSchema, request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    await must(db.supplier.findFirst({ where: { id: body.supplierId } }), "Fornitore");
    const ingredientIds = [...new Set(body.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))];
    if (ingredientIds.length && (await db.ingredient.count({ where: { id: { in: ingredientIds } } })) !== ingredientIds.length) {
      throw new HttpError(400, "Articolo non trovato");
    }
    const order = await db.purchaseOrder.create({
      data: {
        tenantId: id,
        supplierId: body.supplierId,
        status: "SENT",
        notes: blankToNull(body.notes),
        expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
      },
    });
    await db.purchaseOrderLine.createMany({
      data: body.lines.map((line) => ({ tenantId: id, orderId: order.id, ingredientId: line.ingredientId || null, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })),
    });
    if (ingredientIds.length) {
      await db.ingredient.updateMany({ where: { id: { in: ingredientIds }, supplierId: null }, data: { supplierId: body.supplierId } });
    }
    return db.purchaseOrder.findFirst({ where: { id: order.id }, include: { lines: true, supplier: true } });
  });

  app.post("/purchase-orders/:id/cancel", { preHandler: [app.requireTenant, permit("suppliers.write"), moduleGuard("suppliers")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    const order = await must(db.purchaseOrder.findFirst({ where: { id: idOf(request) } }), "Ordine");
    if (order.status === "RECEIVED") throw new HttpError(409, "Un ordine ricevuto non si annulla");
    if (order.status === "CANCELLED") return order;
    return db.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  });

  app.post("/purchase-orders/:id/receive", { preHandler: [app.requireTenant, permit("inventory.write"), moduleGuard("suppliers")] }, async (request) => {
    const requested = (request.body as { locationId?: string } | undefined)?.locationId;
    const id = tenantId(request);
    const db = tenantDb(id);
    const order = await must(db.purchaseOrder.findFirst({ where: { id: idOf(request) }, include: { lines: true, supplier: true } }), "Ordine");
    if (order.status === "RECEIVED") throw new HttpError(409, "Ordine già ricevuto");
    if (order.status === "CANCELLED") throw new HttpError(409, "Un ordine annullato non si riceve");
    const location = await inventoryLocation(id, requested);
    await prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        if (!line.ingredientId) continue;
        await tx.stockMovement.create({
          data: { tenantId: id, ingredientId: line.ingredientId, locationId: location.id, quantity: line.quantity, reason: `Ordine da ${order.supplier.name}` },
        });
        if (num(line.unitPrice) > 0) await tx.ingredient.update({ where: { id: line.ingredientId }, data: { unitCost: line.unitPrice } });
      }
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    });
    return db.purchaseOrder.findFirst({ where: { id: order.id }, include: { lines: true } });
  });

  app.get("/shifts", { preHandler: [app.requireTenant, permit("shifts.read"), moduleGuard("shifts")] }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    const db = tenantDb(tenantId(request));
    const include = { user: { select: { id: true, name: true } } };
    const fromRaw = query.from?.trim();
    const toRaw = query.to?.trim();
    if (fromRaw || toRaw) {
      const from = fromRaw ? new Date(fromRaw) : null;
      const to = toRaw ? new Date(toRaw) : null;
      if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new HttpError(400, "Intervallo di date non valido");
      if (to.getTime() - from.getTime() > 70 * 86_400_000) throw new HttpError(400, "Chiedi al massimo due mesi alla volta");
      return db.shift.findMany({
        where: { startsAt: { lt: to }, endsAt: { gt: from } },
        include,
        orderBy: { startsAt: "asc" },
        take: 5000,
      });
    }
    return db.shift.findMany({ include, orderBy: { startsAt: "asc" }, take: 100 });
  });

  app.post("/shifts", { preHandler: [app.requireTenant, permit("shifts.write"), moduleGuard("shifts")] }, async (request) => {
    const body = parseBody(shiftSchema, request.body);
    const id = tenantId(request);
    const created = await tenantDb(id).shift.create({
      data: { tenantId: id, userId: body.userId, roleLabel: blankToNull(body.roleLabel), startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), status: body.status ?? "PLANNED" },
    });
    await refreshPayrollForShifts(id, [created]).catch((error) => request.log.error(error));
    return created;
  });

  app.patch("/shifts/:id", { preHandler: [app.requireTenant, permit("shifts.write"), moduleGuard("shifts")] }, async (request) => {
    const body = parseBody(shiftSchema.partial(), request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    const existing = await must(db.shift.findFirst({ where: { id: idOf(request) } }), "Turno");
    const updated = await db.shift.update({
      where: { id: idOf(request) },
      data: {
        userId: body.userId,
        roleLabel: body.roleLabel,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        status: body.status,
      },
    });
    await refreshPayrollForShifts(id, [existing, updated]).catch((error) => request.log.error(error));
    return updated;
  });
}
