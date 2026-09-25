import {
  assetSchema,
  checklistRunSchema,
  checklistTemplateSchema,
  customerSchema,
  scheduleSchema,
  signatureSchema,
  workOrderSchema,
} from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { blankToNull, HttpError, must, num, parseBody } from "../errors";
import { assertCustomFields } from "../lib/fields";
import { renderWorkOrderPdf } from "../lib/pdf";
import { prisma, tenantDb } from "../lib/prisma";
import { saveUpload } from "../lib/storage";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

function search(request: { query: unknown }): string {
  return ((request.query as { q?: string }).q ?? "").trim();
}

export async function coreRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: [app.requireTenant, permit("dashboard.view"), moduleGuard("dashboard")] }, async (request) => {
    const id = tenantId(request);
    const db = tenantDb(id);
    const [openWorkOrders, dueSoon, openOrders, balances] = await Promise.all([
      db.workOrder.count({ where: { status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS"] } } }),
      db.schedule.findMany({ where: { dueAt: { lte: new Date(Date.now() + 14 * 86400000) } }, orderBy: { dueAt: "asc" }, take: 6, include: { asset: true } }),
      db.order.count({ where: { status: { in: ["OPEN", "SENT", "PARTIAL"] } } }),
      db.stockMovement.groupBy({ by: ["partId"], where: { partId: { not: null } }, _sum: { quantity: true } }),
    ]);
    const lowStock = balances.filter((row) => row.partId && num(row._sum.quantity) <= 2).length;
    return { openWorkOrders, dueSoon, openOrders, lowStock };
  });

  app.get("/customers", { preHandler: [app.requireTenant, permit("customers.read")] }, async (request) => {
    const q = search(request);
    return tenantDb(tenantId(request)).customer.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
      take: 100,
    });
  });

  app.post("/customers", { preHandler: [app.requireTenant, permit("customers.write")] }, async (request) => {
    const body = parseBody(customerSchema, request.body);
    const id = tenantId(request);
    const customFields = await assertCustomFields(id, "CUSTOMER", body.customFields);
    return tenantDb(id).customer.create({
      data: { tenantId: id, name: body.name, phone: blankToNull(body.phone), email: blankToNull(body.email), address: blankToNull(body.address), city: blankToNull(body.city), notes: blankToNull(body.notes), customFields },
    });
  });

  app.get("/customers/:id", { preHandler: [app.requireTenant, permit("customers.read")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    return must(db.customer.findFirst({ where: { id: idOf(request) }, include: { assets: true, workOrders: { orderBy: { createdAt: "desc" }, take: 20 } } }), "Cliente");
  });

  app.patch("/customers/:id", { preHandler: [app.requireTenant, permit("customers.write")] }, async (request) => {
    const body = parseBody(customerSchema.partial(), request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    await must(db.customer.findFirst({ where: { id: idOf(request) } }), "Cliente");
    const customFields = body.customFields ? await assertCustomFields(id, "CUSTOMER", body.customFields) : undefined;
    return db.customer.update({
      where: { id: idOf(request) },
      data: { ...body, email: body.email === undefined ? undefined : blankToNull(body.email), customFields },
    });
  });

  app.delete("/customers/:id", { preHandler: [app.requireTenant, permit("customers.write")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.customer.findFirst({ where: { id: idOf(request) } }), "Cliente");
    await db.customer.delete({ where: { id: idOf(request) } }).catch(() => {
      throw new HttpError(409, "Il cliente ha dati collegati");
    });
    return { ok: true };
  });

  app.get("/assets", { preHandler: [app.requireTenant, permit("assets.read"), moduleGuard("assets")] }, async (request) => {
    const q = search(request);
    const customerId = (request.query as { customerId?: string }).customerId;
    return tenantDb(tenantId(request)).asset.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { serialNumber: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { customer: true },
      orderBy: { name: "asc" },
      take: 100,
    });
  });

  app.post("/assets", { preHandler: [app.requireTenant, permit("assets.write"), moduleGuard("assets")] }, async (request) => {
    const body = parseBody(assetSchema, request.body);
    const id = tenantId(request);
    const customFields = await assertCustomFields(id, "ASSET", body.customFields);
    return tenantDb(id).asset.create({
      data: {
        tenantId: id,
        customerId: body.customerId || null,
        locationId: body.locationId || null,
        type: blankToNull(body.type),
        name: body.name,
        brand: blankToNull(body.brand),
        model: blankToNull(body.model),
        serialNumber: blankToNull(body.serialNumber),
        installedAt: body.installedAt ? new Date(body.installedAt) : null,
        notes: blankToNull(body.notes),
        customFields,
      },
    });
  });

  app.get("/assets/:id", { preHandler: [app.requireTenant, permit("assets.read"), moduleGuard("assets")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    return must(
      db.asset.findFirst({
        where: { id: idOf(request) },
        include: { customer: true, workOrders: { orderBy: { createdAt: "desc" } }, schedules: { orderBy: { dueAt: "asc" } } },
      }),
      "Impianto",
    );
  });

  app.patch("/assets/:id", { preHandler: [app.requireTenant, permit("assets.write"), moduleGuard("assets")] }, async (request) => {
    const body = parseBody(assetSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.asset.findFirst({ where: { id: idOf(request) } }), "Impianto");
    return db.asset.update({
      where: { id: idOf(request) },
      data: {
        ...body,
        installedAt: body.installedAt === undefined ? undefined : body.installedAt ? new Date(body.installedAt) : null,
        customFields: body.customFields,
      },
    });
  });

  const orderInclude = {
    customer: true,
    asset: true,
    assignee: { select: { id: true, name: true } },
    attachments: true,
    checklistRuns: true,
    stockMovements: { include: { part: true, location: true }, orderBy: { createdAt: "desc" as const } },
  } as const;

  app.get("/work-orders", { preHandler: [app.requireTenant, permit("work_orders.read"), moduleGuard("work_orders")] }, async (request) => {
    const status = (request.query as { status?: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "DONE" | "CANCELLED" }).status;
    return tenantDb(tenantId(request)).workOrder.findMany({
      where: status ? { status } : undefined,
      include: { customer: true, asset: true },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    });
  });

  app.post("/work-orders", { preHandler: [app.requireTenant, permit("work_orders.write"), moduleGuard("work_orders")] }, async (request) => {
    const body = parseBody(workOrderSchema, request.body);
    const id = tenantId(request);
    const customFields = await assertCustomFields(id, "WORK_ORDER", body.customFields);
    return tenantDb(id).workOrder.create({
      data: {
        tenantId: id,
        customerId: body.customerId || null,
        assetId: body.assetId || null,
        assigneeId: body.assigneeId || null,
        title: body.title,
        description: blankToNull(body.description),
        status: body.status ?? "SCHEDULED",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        customFields,
      },
      include: orderInclude,
    });
  });

  app.get("/work-orders/:id", { preHandler: [app.requireTenant, permit("work_orders.read"), moduleGuard("work_orders")] }, async (request) => {
    return must(tenantDb(tenantId(request)).workOrder.findFirst({ where: { id: idOf(request) }, include: orderInclude }), "Intervento");
  });

  app.patch("/work-orders/:id", { preHandler: [app.requireTenant, permit("work_orders.write"), moduleGuard("work_orders")] }, async (request) => {
    const body = parseBody(workOrderSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.workOrder.findFirst({ where: { id: idOf(request) } }), "Intervento");
    return db.workOrder.update({
      where: { id: idOf(request) },
      data: {
        ...body,
        scheduledAt: body.scheduledAt === undefined ? undefined : body.scheduledAt ? new Date(body.scheduledAt) : null,
        completedAt: body.status === "DONE" ? new Date() : undefined,
        customFields: body.customFields,
      },
      include: orderInclude,
    });
  });

  app.post("/work-orders/:id/signature", { preHandler: [app.requireTenant, permit("work_orders.write"), moduleGuard("work_orders")] }, async (request) => {
    const body = parseBody(signatureSchema, request.body);
    const db = tenantDb(tenantId(request));
    await must(db.workOrder.findFirst({ where: { id: idOf(request) } }), "Intervento");
    return db.workOrder.update({
      where: { id: idOf(request) },
      data: { signatureData: body.signatureData, signedBy: body.signedBy, status: "DONE", completedAt: new Date() },
    });
  });

  app.post("/work-orders/:id/parts", { preHandler: [app.requireTenant, permit("stock.adjust"), moduleGuard("work_orders")] }, async (request) => {
    const body = request.body as { partId?: string; locationId?: string; quantity?: number };
    if (!body.partId || !body.locationId || !body.quantity) throw new HttpError(400, "Ricambio, luogo e quantità sono obbligatori");
    const id = tenantId(request);
    const db = tenantDb(id);
    await must(db.workOrder.findFirst({ where: { id: idOf(request) } }), "Intervento");
    return db.stockMovement.create({
      data: {
        tenantId: id,
        partId: body.partId,
        locationId: body.locationId,
        quantity: -Math.abs(body.quantity),
        reason: "Usato in intervento",
        workOrderId: idOf(request),
      },
    });
  });

  app.get("/work-orders/:id/pdf", { preHandler: [app.requireTenant, permit("work_orders.read"), moduleGuard("work_orders")] }, async (request, reply) => {
    const id = tenantId(request);
    const report = await must(
      prisma.workOrder.findFirst({
        where: { id: idOf(request), tenantId: id },
        include: { customer: true, asset: true, attachments: true, checklistRuns: true },
      }),
      "Intervento",
    );
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    const pdf = await renderWorkOrderPdf(report, tenant?.name ?? "Bitora");
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="rapportino-${report.id}.pdf"`);
    return reply.send(pdf);
  });

  app.post("/attachments", { preHandler: [app.requireTenant, permit("work_orders.write")] }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, "File mancante");
    const workOrderField = file.fields.workOrderId as { value?: string } | undefined;
    const id = tenantId(request);
    const url = await saveUpload(file.filename, file.mimetype, await file.toBuffer());
    return tenantDb(id).attachment.create({
      data: { tenantId: id, workOrderId: workOrderField?.value || null, fileName: file.filename, mimeType: file.mimetype, url },
    });
  });

  app.get("/checklist-templates", { preHandler: [app.requireTenant, permit("checklists.read"), moduleGuard("checklists")] }, async (request) => {
    return tenantDb(tenantId(request)).checklistTemplate.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/checklist-templates", { preHandler: [app.requireTenant, permit("checklists.manage"), moduleGuard("checklists")] }, async (request) => {
    const body = parseBody(checklistTemplateSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).checklistTemplate.create({ data: { tenantId: id, name: body.name, kind: body.kind ?? "GENERIC", items: body.items } });
  });

  app.patch("/checklist-templates/:id", { preHandler: [app.requireTenant, permit("checklists.manage"), moduleGuard("checklists")] }, async (request) => {
    const body = parseBody(checklistTemplateSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.checklistTemplate.findFirst({ where: { id: idOf(request) } }), "Checklist");
    return db.checklistTemplate.update({ where: { id: idOf(request) }, data: body });
  });

  app.delete("/checklist-templates/:id", { preHandler: [app.requireTenant, permit("checklists.manage"), moduleGuard("checklists")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.checklistTemplate.findFirst({ where: { id: idOf(request) } }), "Checklist");
    await db.checklistTemplate.delete({ where: { id: idOf(request) } });
    return { ok: true };
  });

  app.get("/checklist-runs", { preHandler: [app.requireTenant, permit("checklists.read"), moduleGuard("checklists")] }, async (request) => {
    return tenantDb(tenantId(request)).checklistRun.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { template: { select: { name: true } } } });
  });

  app.post("/checklist-runs", { preHandler: [app.requireTenant, permit("checklists.read"), moduleGuard("checklists")] }, async (request) => {
    const body = parseBody(checklistRunSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).checklistRun.create({
      data: {
        tenantId: id,
        templateId: body.templateId || null,
        workOrderId: body.workOrderId || null,
        assetId: body.assetId || null,
        answers: body.answers,
        completedAt: body.completed ? new Date() : null,
      },
    });
  });

  app.get("/schedules", { preHandler: [app.requireTenant, permit("schedules.read"), moduleGuard("calendar")] }, async (request) => {
    return tenantDb(tenantId(request)).schedule.findMany({ include: { asset: true, template: true }, orderBy: { dueAt: "asc" }, take: 200 });
  });

  app.post("/schedules", { preHandler: [app.requireTenant, permit("schedules.write"), moduleGuard("calendar")] }, async (request) => {
    const body = parseBody(scheduleSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).schedule.create({
      data: {
        tenantId: id,
        assetId: body.assetId || null,
        templateId: body.templateId || null,
        kind: body.kind,
        title: body.title,
        dueAt: new Date(body.dueAt),
        intervalMonths: body.intervalMonths ?? null,
      },
    });
  });

  app.patch("/schedules/:id", { preHandler: [app.requireTenant, permit("schedules.write"), moduleGuard("calendar")] }, async (request) => {
    const body = parseBody(scheduleSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.schedule.findFirst({ where: { id: idOf(request) } }), "Scadenza");
    return db.schedule.update({
      where: { id: idOf(request) },
      data: {
        ...(body.assetId !== undefined ? { assetId: body.assetId || null } : {}),
        ...(body.templateId !== undefined ? { templateId: body.templateId || null } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.dueAt !== undefined ? { dueAt: new Date(body.dueAt) } : {}),
        ...(body.intervalMonths !== undefined ? { intervalMonths: body.intervalMonths } : {}),
      },
    });
  });

  app.delete("/schedules/:id", { preHandler: [app.requireTenant, permit("schedules.write"), moduleGuard("calendar")] }, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.schedule.findFirst({ where: { id: idOf(request) } }), "Scadenza");
    await db.schedule.delete({ where: { id: idOf(request) } });
    return { ok: true };
  });
}
