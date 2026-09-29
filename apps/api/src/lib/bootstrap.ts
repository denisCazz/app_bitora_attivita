import type { Prisma } from "@prisma/client";
import { GENERIC_CATEGORY_KEY, PERMISSIONS, trialKeys, type ActivitySetup, type ModuleKey, type PresetSample, type VocabItem } from "@rapportini/shared";
import { HttpError } from "../errors";
import { catalogNodes, resolvedCategory } from "./catalog";
import { prisma } from "./prisma";
import { ENTITY_KEY, writeFieldValues } from "./values";

type Tx = Prisma.TransactionClient;

function slug(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return key || "item";
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function todayAt(time: string): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(new Date().setHours(hours, minutes, 0, 0));
}

export async function createTenantForUser(
  userId: string,
  input: { name: string; categoryId: string; city?: string; withSample?: boolean; needs?: string[]; trials?: ModuleKey[]; setup?: ActivitySetup },
) {
  const node = (await catalogNodes()).find((item) => item.id === input.categoryId);
  if (!node?.active) throw new HttpError(400, "Categoria non disponibile");
  const category = await resolvedCategory(input.categoryId);
  const roleTemplates = category.roles.length
    ? category.roles
    : [{ name: "Titolare", owner: true, permissions: [...PERMISSIONS], sortOrder: 0 }];
  const setup = category.key === GENERIC_CATEGORY_KEY ? input.setup : undefined;
  const needs = setup
    ? [...new Set(setup.modules)].filter((key) => category.modules.some((module) => module.key === key))
    : [...new Set(input.needs ?? [])].filter((key) => category.needs.some((need) => need.key === key));
  const trials = category.modules.filter((module) => trialKeys(category.modules, input.trials ?? []).includes(module.key));

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        categoryId: category.id,
        needs,
        activity: setup?.activity ?? null,
      },
    });
    const location = await tx.location.create({
      data: { tenantId: tenant.id, name: "Sede principale", city: input.city ?? null },
    });
    const roles = [];
    for (const role of roleTemplates) {
      roles.push(
        await tx.role.create({
          data: { tenantId: tenant.id, name: role.name, permissions: role.permissions, isSystem: role.owner },
        }),
      );
    }
    const owner = roles.find((role) => role.isSystem) ?? roles[0];
    if (!owner) throw new Error("Ruolo titolare mancante");
    await tx.membership.create({
      data: { userId, tenantId: tenant.id, roleId: owner.id, status: "ACTIVE" },
    });
    await tx.user.update({ where: { id: userId }, data: { activeTenantId: tenant.id } });
    await tx.tenantModule.createMany({
      data: [
        ...category.modules.filter((module) => module.free).map((module) => ({ tenantId: tenant.id, moduleKey: module.key, enabled: true })),
        ...trials.map((module) => ({ tenantId: tenant.id, moduleKey: module.key, enabled: true, trialEndsAt: inDays(module.trialDays) })),
      ],
    });
    const scopeKey = `tenant:${tenant.id}`;
    for (const [termKey, value] of Object.entries(setup?.terminology ?? {})) {
      if (!value) continue;
      await tx.termValue.create({ data: { tenantId: tenant.id, termKey, scopeKey, value } });
    }
    if (setup) {
      const vocab = [
        ...setup.assetTypes.map((label, index) => ({ listKey: "asset_types", key: slug(label), label, sortOrder: index })),
        ...setup.scheduleKinds.map((item, index) => ({ listKey: "schedule_kinds", key: item.key, label: item.label, tone: item.tone ?? null, minutes: item.minutes ?? null, sortOrder: index })),
        ...setup.stations.map((item, index) => ({ listKey: "stations", key: item.key, label: item.label, sortOrder: index })),
      ];
      if (vocab.length) {
        await tx.vocabItem.createMany({
          data: vocab.map((item) => ({ tenantId: tenant.id, scopeKey, tone: null, minutes: null, ...item })),
        });
      }
      for (const field of setup.customFields) {
        const entityId = ENTITY_KEY[field.entity] ?? field.entity;
        const created = await tx.fieldDef.create({
          data: { tenantId: tenant.id, entityId, scopeKey, key: field.key, label: field.label, type: field.type, builtIn: false, visible: true, required: false },
        });
        if (field.options?.length) {
          await tx.fieldOption.createMany({ data: field.options.map((option, index) => ({ fieldId: created.id, value: option, label: option, sortOrder: index })) });
        }
      }
    }
    const checklists = [...(category.presets.checklists ?? [])];
    for (const checklist of setup?.checklists ?? []) {
      if (!checklists.some((existing) => existing.name === checklist.name)) checklists.push(checklist);
    }
    for (const checklist of checklists) {
      const created = await tx.checklistTemplate.create({
        data: { tenantId: tenant.id, name: checklist.name, kind: checklist.kind },
      });
      await tx.checklistTemplateItem.createMany({
        data: checklist.items.map((item, index) => ({ templateId: created.id, itemKey: item.id, label: item.label, sortOrder: index })),
      });
    }
    if (input.withSample && category.presets.sample) {
      await createSample(tx, { tenantId: tenant.id, locationId: location.id, userId }, category.presets.sample, category.vocab.stations);
    }
    return tenant;
  });
}

async function createSample(tx: Tx, ids: { tenantId: string; locationId: string; userId: string }, sample: PresetSample, stations: VocabItem[]) {
  const { tenantId, locationId, userId } = ids;
  const customer = sample.customer
    ? await tx.customer.create({
        data: { tenantId, name: sample.customer.name, phone: sample.customer.phone ?? null, city: sample.customer.city ?? null, address: sample.customer.address ?? null },
      })
    : null;

  const locations = new Map<string, string>();
  for (const stockLocation of sample.stockLocations ?? []) {
    const created = await tx.stockLocation.create({ data: { tenantId, name: stockLocation.name, kind: stockLocation.kind } });
    locations.set(stockLocation.name, created.id);
  }
  async function stock(item: { partId?: string; ingredientId?: string }, rows: Array<{ location: string; quantity: number }> | undefined) {
    const data = (rows ?? [])
      .filter((row) => locations.has(row.location))
      .map((row) => ({ tenantId, ...item, locationId: locations.get(row.location)!, quantity: row.quantity, reason: "Giacenza iniziale" }));
    if (data.length) await tx.stockMovement.createMany({ data });
  }

  const assetIds: string[] = [];
  for (const preset of [...(sample.asset ? [sample.asset] : []), ...(sample.assets ?? [])]) {
    const asset = await tx.asset.create({
      data: {
        tenantId,
        customerId: customer?.id ?? null,
        locationId,
        type: preset.type ?? null,
        name: preset.name,
        brand: preset.brand ?? null,
        model: preset.model ?? null,
        serialNumber: preset.serialNumber ?? null,
      },
    });
    if (preset.customFields) await writeFieldValues(tenantId, "asset", asset.id, preset.customFields, tx);
    assetIds.push(asset.id);
  }

  for (const part of sample.parts ?? []) {
    const created = await tx.sparePart.create({
      data: {
        tenantId,
        sku: part.sku,
        name: part.name,
        brand: part.brand ?? null,
        compatibleModels: part.models ?? [],
        barcode: part.barcode ?? null,
        unitPrice: part.price ?? 0,
      },
    });
    await stock({ partId: created.id }, part.stock);
  }

  const ingredients = new Map<string, string>();
  for (const ingredient of sample.ingredients ?? []) {
    const created = await tx.ingredient.create({
      data: {
        tenantId,
        name: ingredient.name,
        unit: ingredient.unit,
        sku: ingredient.sku ?? null,
        category: ingredient.category ?? null,
        minQuantity: ingredient.min ?? null,
        unitCost: ingredient.cost ?? null,
      },
    });
    ingredients.set(ingredient.name, created.id);
    await stock({ ingredientId: created.id }, ingredient.stock);
  }

  const modifiers = new Map<string, string>();
  for (const modifier of sample.modifiers ?? []) {
    const created = await tx.modifier.create({ data: { tenantId, name: modifier.name, priceDelta: modifier.priceDelta ?? 0 } });
    modifiers.set(modifier.name, created.id);
  }

  const menu = new Map<string, { id: string; price: number; station: string }>();
  for (const item of sample.menu ?? []) {
    const station = item.station ?? stations[0]?.key ?? "MAIN";
    const created = await tx.menuItem.create({ data: { tenantId, name: item.name, category: item.category, station, price: item.price } });
    menu.set(item.name, { id: created.id, price: item.price, station });
    const modifierIds = (item.modifiers ?? []).map((name) => modifiers.get(name)).filter((id): id is string => Boolean(id));
    if (modifierIds.length) await tx.menuItemModifier.createMany({ data: modifierIds.map((modifierId) => ({ tenantId, menuItemId: created.id, modifierId })) });
  }

  for (const supplier of sample.suppliers ?? []) {
    const created = await tx.supplier.create({ data: { tenantId, name: supplier.name, phone: supplier.phone ?? null, email: supplier.email ?? null } });
    if (!supplier.order?.length) continue;
    const purchase = await tx.purchaseOrder.create({ data: { tenantId, supplierId: created.id, status: "DRAFT" } });
    await tx.purchaseOrderLine.createMany({
      data: supplier.order.map((line) => ({
        tenantId,
        orderId: purchase.id,
        ingredientId: line.ingredient ? (ingredients.get(line.ingredient) ?? null) : null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    });
    for (const line of supplier.order) {
      const preset = sample.ingredients?.find((ingredient) => ingredient.name === line.ingredient);
      const ingredientId = line.ingredient ? ingredients.get(line.ingredient) : undefined;
      if (!preset || !ingredientId) continue;
      await tx.ingredient.update({
        where: { id: ingredientId },
        data: { supplierId: created.id, unitCost: preset.cost ?? line.unitPrice, minQuantity: preset.min ?? line.quantity },
      });
    }
  }

  const tables = new Map<string, string>();
  for (const table of sample.tables ?? []) {
    const created = await tx.diningTable.create({ data: { tenantId, locationId, name: table.name, posX: table.posX, posY: table.posY, seats: table.seats } });
    tables.set(table.name, created.id);
  }

  if (sample.workOrder) {
    await tx.workOrder.create({
      data: {
        tenantId,
        customerId: customer?.id ?? null,
        assetId: assetIds[0] ?? null,
        title: sample.workOrder,
        description: "Esempio: aprilo per provare foto, checklist e firma.",
        status: "SCHEDULED",
        scheduledAt: inDays(1),
      },
    });
  }

  if (sample.schedule) {
    const schedule = typeof sample.schedule === "string" ? { title: sample.schedule } : sample.schedule;
    const template =
      (schedule.kind ? await tx.checklistTemplate.findFirst({ where: { tenantId, kind: schedule.kind } }) : null) ??
      (await tx.checklistTemplate.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } }));
    await tx.schedule.create({
      data: {
        tenantId,
        assetId: customer ? (assetIds[0] ?? null) : null,
        templateId: template?.id ?? null,
        kind: schedule.kind ?? template?.kind ?? "GENERIC",
        title: schedule.title,
        dueAt: inDays(schedule.dueInDays ?? 1),
        intervalMonths: schedule.intervalMonths ?? 12,
      },
    });
  }

  if (sample.shift) {
    await tx.shift.create({
      data: { tenantId, userId, roleLabel: sample.shift.roleLabel ?? null, startsAt: todayAt(sample.shift.start), endsAt: todayAt(sample.shift.end), status: "CONFIRMED" },
    });
  }

  const lines = (sample.order?.lines ?? []).filter((line) => menu.has(line.item));
  if (sample.order && lines.length) {
    const rows = lines.map((line) => {
      const item = menu.get(line.item)!;
      return { tenantId, menuItemId: item.id, name: line.item, station: item.station, quantity: line.quantity ?? 1, unitPrice: item.price, status: line.status ?? "SENT" as const };
    });
    const order = await tx.order.create({
      data: {
        tenantId,
        tableId: sample.order.table ? (tables.get(sample.order.table) ?? null) : null,
        covers: sample.order.covers ?? 1,
        status: rows.some((line) => line.status === "PENDING") ? "PARTIAL" : "SENT",
      },
    });
    await tx.orderLine.createMany({ data: rows.map((row) => ({ ...row, orderId: order.id })) });
  }
}
