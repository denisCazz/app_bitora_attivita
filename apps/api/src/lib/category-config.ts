import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;

function slug(label: string, used: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 36) || "item";
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  used.add(key);
  return key;
}

async function replaceList(tx: Tx, categoryId: string, scopeKey: string, listKey: string, items: Array<{ key: string; label: string; tone?: string | null; minutes?: number | null; sortOrder: number }>) {
  await tx.vocabItem.deleteMany({ where: { categoryId, listKey } });
  if (!items.length) return;
  await tx.vocabItem.createMany({
    data: items.map((item) => ({
      categoryId,
      listKey,
      scopeKey,
      key: item.key,
      label: item.label,
      tone: item.tone ?? null,
      minutes: item.minutes ?? null,
      sortOrder: item.sortOrder,
      visible: true,
    })),
  });
}

const ENTITY: Record<string, string> = { CUSTOMER: "customer", ASSET: "asset", WORK_ORDER: "work_order", PRODUCT: "menu_item" };

/** Writes the category overlay the console still sends as terminology and presets. */
export async function applyCategoryConfig(
  categoryId: string,
  input: {
    terminology?: Record<string, string | undefined>;
    presets?: {
      assetTypes?: string[];
      customFields?: Array<{ entity: string; key: string; label: string; type: string; options?: string[] }>;
      checklists?: Array<{ name: string; kind: string; items: Array<{ id: string; label: string }> }>;
      scheduleKinds?: Array<{ key: string; label: string; tone?: string; minutes?: number }>;
      stations?: Array<{ key: string; label: string }>;
      dashboard?: string[];
      ledger?: { income?: string[]; expense?: string[] };
    };
  },
) {
  const scopeKey = `category:${categoryId}`;
  await prisma.$transaction(async (tx) => {
    if (input.terminology) {
      await tx.termValue.deleteMany({ where: { categoryId } });
      const rows = Object.entries(input.terminology).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));
      if (rows.length) await tx.termValue.createMany({ data: rows.map(([termKey, value]) => ({ categoryId, termKey, scopeKey, value })) });
    }
    const presets = input.presets;
    if (!presets) return;
    if (presets.assetTypes) {
      const used = new Set<string>();
      await replaceList(tx, categoryId, scopeKey, "asset_types", presets.assetTypes.map((label, index) => ({ key: slug(label, used), label, sortOrder: index })));
    }
    if (presets.scheduleKinds) {
      await replaceList(
        tx,
        categoryId,
        scopeKey,
        "schedule_kinds",
        presets.scheduleKinds.map((item, index) => ({ key: item.key, label: item.label, tone: item.tone ?? null, minutes: item.minutes ?? null, sortOrder: index })),
      );
    }
    if (presets.stations) {
      await replaceList(tx, categoryId, scopeKey, "stations", presets.stations.map((item, index) => ({ key: item.key, label: item.label, sortOrder: index })));
    }
    if (presets.dashboard) {
      const used = new Set<string>();
      await replaceList(tx, categoryId, scopeKey, "dashboard_widgets", presets.dashboard.map((label, index) => ({ key: slug(label, used), label, sortOrder: index })));
    }
    if (presets.ledger?.income) {
      const used = new Set<string>();
      await replaceList(tx, categoryId, scopeKey, "ledger_income", presets.ledger.income.map((label, index) => ({ key: slug(label, used), label, sortOrder: index })));
    }
    if (presets.ledger?.expense) {
      const used = new Set<string>();
      await replaceList(tx, categoryId, scopeKey, "ledger_expense", presets.ledger.expense.map((label, index) => ({ key: slug(label, used), label, sortOrder: index })));
    }
    if (presets.customFields) {
      await tx.fieldDef.deleteMany({ where: { categoryId, builtIn: false } });
      for (const [index, field] of presets.customFields.entries()) {
        const entityId = ENTITY[field.entity] ?? field.entity;
        await tx.fieldDef.create({
          data: {
            categoryId,
            entityId,
            scopeKey,
            key: field.key,
            label: field.label,
            type: field.type as "TEXT",
            builtIn: false,
            visible: true,
            required: false,
            sortOrder: index,
            options: { create: (field.options ?? []).map((option, optionIndex) => ({ value: option, label: option, sortOrder: optionIndex })) },
          },
        });
      }
    }
    if (presets.checklists) {
      await tx.checklistPreset.deleteMany({ where: { categoryId } });
      for (const [index, list] of presets.checklists.entries()) {
        await tx.checklistPreset.create({
          data: {
            categoryId,
            name: list.name,
            kind: list.kind,
            sortOrder: index,
            items: { create: list.items.map((item, itemIndex) => ({ itemKey: item.id, label: item.label, sortOrder: itemIndex })) },
          },
        });
      }
    }
  });
}
