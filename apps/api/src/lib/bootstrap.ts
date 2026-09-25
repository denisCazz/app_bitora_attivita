import type { Prisma } from "@prisma/client";
import { PERMISSIONS, type PresetSample } from "@rapportini/shared";
import { HttpError } from "../errors";
import { catalogNodes, resolvedCategory } from "./catalog";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;

function inDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createTenantForUser(
  userId: string,
  input: { name: string; categoryId: string; city?: string; withSample?: boolean },
) {
  const node = (await catalogNodes()).find((item) => item.id === input.categoryId);
  if (!node?.active) throw new HttpError(400, "Categoria non disponibile");
  const category = await resolvedCategory(input.categoryId);
  const roleTemplates = category.roles.length
    ? category.roles
    : [{ name: "Titolare", owner: true, permissions: [...PERMISSIONS], sortOrder: 0 }];

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        vertical: category.family,
        categoryId: category.id,
        branding: { logoUrl: null },
        settings: { terminology: {} },
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
      data: category.modules.map((module) => ({ tenantId: tenant.id, moduleKey: module.key, enabled: true, config: {} })),
    });
    for (const field of category.presets.customFields ?? []) {
      await tx.customFieldDef.create({
        data: { tenantId: tenant.id, entity: field.entity, key: field.key, label: field.label, type: field.type, options: field.options ?? [] },
      });
    }
    for (const checklist of category.presets.checklists ?? []) {
      await tx.checklistTemplate.create({
        data: { tenantId: tenant.id, name: checklist.name, kind: checklist.kind, items: checklist.items },
      });
    }
    if (input.withSample !== false) {
      if (category.family === "FIELD_SERVICE") await sampleFieldService(tx, tenant.id, location.id, category.presets.sample);
      else await sampleHospitality(tx, tenant.id, location.id, userId);
    }
    return tenant;
  });
}

async function sampleFieldService(tx: Tx, tenantId: string, locationId: string, sample: PresetSample | undefined) {
  const customer = await tx.customer.create({
    data: { tenantId, name: "Mario Rossi", phone: "3331234567", city: "Brescia", address: "Via Roma 12" },
  });
  const preset = sample?.asset ?? { name: "Impianto principale", type: "Impianto" };
  const asset = await tx.asset.create({
    data: {
      tenantId,
      customerId: customer.id,
      locationId,
      type: preset.type ?? null,
      name: preset.name,
      brand: preset.brand ?? null,
      model: preset.model ?? null,
      serialNumber: preset.serialNumber ?? null,
      customFields: preset.customFields ?? {},
      installedAt: new Date("2022-10-03"),
    },
  });
  const warehouse = await tx.stockLocation.create({ data: { tenantId, name: "Magazzino", kind: "WAREHOUSE" } });
  const van = await tx.stockLocation.create({ data: { tenantId, name: "Furgone", kind: "VAN" } });
  for (const [index, part] of (sample?.parts ?? []).entries()) {
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
    if (index === 0) {
      await tx.stockMovement.createMany({
        data: [
          { tenantId, partId: created.id, locationId: warehouse.id, quantity: 6, reason: "Carico iniziale" },
          { tenantId, partId: created.id, locationId: van.id, quantity: 2, reason: "Carico furgone" },
        ],
      });
    }
  }
  const template = await tx.checklistTemplate.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  await tx.workOrder.create({
    data: {
      tenantId,
      customerId: customer.id,
      assetId: asset.id,
      title: sample?.workOrder ?? "Primo intervento",
      description: "Intervento di esempio: aprilo per provare foto, checklist e firma.",
      status: "SCHEDULED",
      scheduledAt: inDays(1),
    },
  });
  await tx.schedule.create({
    data: {
      tenantId,
      assetId: asset.id,
      templateId: template?.id,
      kind: template?.kind ?? "GENERIC",
      title: `${sample?.schedule ?? "Manutenzione"} Rossi`,
      dueAt: inDays(1),
      intervalMonths: 12,
    },
  });
}

async function sampleHospitality(tx: Tx, tenantId: string, locationId: string, userId: string) {
  const tables = [
    ["T1", 0.12, 0.18, 2],
    ["T2", 0.4, 0.18, 2],
    ["T3", 0.68, 0.18, 4],
    ["T4", 0.12, 0.55, 4],
    ["T5", 0.42, 0.55, 4],
    ["Banco", 0.72, 0.62, 6],
  ] as const;
  const createdTables = [];
  for (const [name, posX, posY, seats] of tables) {
    createdTables.push(await tx.diningTable.create({ data: { tenantId, locationId, name, posX, posY, seats } }));
  }
  const noOnion = await tx.modifier.create({ data: { tenantId, name: "Senza cipolla", priceDelta: 0 } });
  const extraShot = await tx.modifier.create({ data: { tenantId, name: "Doppio espresso", priceDelta: 0.5 } });
  const espresso = await tx.menuItem.create({
    data: { tenantId, name: "Espresso", category: "Caffetteria", station: "BAR", price: 1.3 },
  });
  await tx.menuItemModifier.create({ data: { tenantId, menuItemId: espresso.id, modifierId: extraShot.id } });
  await tx.menuItem.create({ data: { tenantId, name: "Spritz", category: "Bar", station: "BAR", price: 5 } });
  const carbonara = await tx.menuItem.create({
    data: { tenantId, name: "Carbonara", category: "Cucina", station: "KITCHEN", price: 13 },
  });
  await tx.menuItemModifier.create({ data: { tenantId, menuItemId: carbonara.id, modifierId: noOnion.id } });
  await tx.menuItem.create({ data: { tenantId, name: "Tiramisù", category: "Dessert", station: "KITCHEN", price: 6 } });

  const eggs = await tx.ingredient.create({ data: { tenantId, name: "Uova", unit: "pz", sku: "UOV" } });
  const guanciale = await tx.ingredient.create({ data: { tenantId, name: "Guanciale", unit: "kg", sku: "GUA" } });
  const pecorino = await tx.ingredient.create({ data: { tenantId, name: "Pecorino", unit: "kg", sku: "PEC" } });
  const kitchen = await tx.stockLocation.create({ data: { tenantId, name: "Cucina", kind: "KITCHEN" } });
  await tx.stockLocation.create({ data: { tenantId, name: "Bar", kind: "BAR" } });
  await tx.stockMovement.createMany({
    data: [
      { tenantId, ingredientId: eggs.id, locationId: kitchen.id, quantity: 40, reason: "Giacenza" },
      { tenantId, ingredientId: guanciale.id, locationId: kitchen.id, quantity: 3.5, reason: "Giacenza" },
      { tenantId, ingredientId: pecorino.id, locationId: kitchen.id, quantity: 1.2, reason: "Giacenza" },
    ],
  });
  const recipe = await tx.recipe.create({ data: { tenantId, menuItemId: carbonara.id } });
  await tx.recipeLine.createMany({
    data: [
      { tenantId, recipeId: recipe.id, ingredientId: eggs.id, quantity: 2 },
      { tenantId, recipeId: recipe.id, ingredientId: guanciale.id, quantity: 0.08 },
      { tenantId, recipeId: recipe.id, ingredientId: pecorino.id, quantity: 0.04 },
    ],
  });
  const supplier = await tx.supplier.create({
    data: { tenantId, name: "Caseificio del lago", phone: "030998877", email: "ordini@caseificio.example" },
  });
  const purchase = await tx.purchaseOrder.create({ data: { tenantId, supplierId: supplier.id, status: "DRAFT" } });
  await tx.purchaseOrderLine.create({
    data: { tenantId, orderId: purchase.id, ingredientId: pecorino.id, description: "Pecorino romano", quantity: 2, unitPrice: 18 },
  });
  await tx.asset.create({
    data: {
      tenantId,
      locationId,
      type: "Macchina caffè",
      name: "Macchina caffè",
      brand: "La Marzocco",
      model: "Linea Mini",
      serialNumber: "LM-4412",
    },
  });
  const template = await tx.checklistTemplate.findFirst({ where: { tenantId } });
  await tx.schedule.create({
    data: {
      tenantId,
      templateId: template?.id,
      kind: "HACCP",
      title: "Controllo temperature",
      dueAt: inDays(0),
      intervalMonths: 1,
    },
  });
  await tx.shift.create({
    data: {
      tenantId,
      userId,
      roleLabel: "Sala",
      startsAt: new Date(new Date().setHours(11, 0, 0, 0)),
      endsAt: new Date(new Date().setHours(15, 0, 0, 0)),
      status: "CONFIRMED",
    },
  });
  const order = await tx.order.create({
    data: { tenantId, tableId: createdTables[0]?.id, covers: 2, status: "OPEN" },
  });
  await tx.orderLine.create({
    data: {
      tenantId,
      orderId: order.id,
      menuItemId: espresso.id,
      name: espresso.name,
      station: "BAR",
      quantity: 2,
      unitPrice: 1.3,
      status: "SENT",
    },
  });
  }
