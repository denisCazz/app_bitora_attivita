import {
  categoryChain,
  resolveCategory,
  type CategoryNode,
  type CategoryPresets,
  type FieldLayer,
  type ModuleDefRow,
  type NavLayer,
  type NeedRow,
  type ResolvedCategory,
  type TermLayer,
  type VocabLayer,
  type VocabListMeta,
} from "@rapportini/shared";
import { HttpError } from "../errors";
import { prisma } from "./prisma";
import { presetFromSamples, type SampleRow } from "./samples";

const TTL_MS = 15_000;

const LEGACY_ENTITY: Record<string, "CUSTOMER" | "ASSET" | "WORK_ORDER" | "PRODUCT"> = {
  customer: "CUSTOMER",
  asset: "ASSET",
  work_order: "WORK_ORDER",
  menu_item: "PRODUCT",
};

interface Snapshot {
  loadedAt: number;
  nodes: CategoryNode[];
  moduleDefs: ModuleDefRow[];
  needs: NeedRow[];
  fields: FieldLayer[];
  terms: TermLayer[];
  termDefaults: Record<string, string>;
  vocabLists: VocabListMeta[];
  vocab: VocabLayer[];
  nav: NavLayer[];
  samples: SampleRow[];
  resolved: Map<string, ResolvedCategory>;
}

let snapshot: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;
const tenantCategory = new Map<string, { categoryId: string; at: number }>();

async function load(): Promise<Snapshot> {
  const [categories, moduleDefs, needs, fieldDefs, termDefs, termValues, vocabLists, vocabItems, navEntries, samples] = await Promise.all([
    prisma.category.findMany({ include: { modules: true, roles: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.moduleDef.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.need.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.fieldDef.findMany({ where: { tenantId: null }, include: { options: true, entity: true, refEntity: true } }),
    prisma.termDef.findMany(),
    prisma.termValue.findMany({ where: { tenantId: null } }),
    prisma.vocabList.findMany(),
    prisma.vocabItem.findMany({ where: { tenantId: null } }),
    prisma.navEntry.findMany({ where: { tenantId: null } }),
    prisma.sampleRecord.findMany({ include: { values: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const presetsByCategory = new Map<string, CategoryPresets>();
  const checklists = await prisma.checklistPreset.findMany({ include: { items: { orderBy: { sortOrder: "asc" } } } });
  for (const category of categories) {
    const ownFields = fieldDefs.filter((field) => field.categoryId === category.id && !field.builtIn);
    const vocab = (list: string) => vocabItems.filter((item) => item.listKey === list && item.categoryId === category.id && item.visible);
    const income = vocab("ledger_income").map((item) => item.label);
    const expense = vocab("ledger_expense").map((item) => item.label);
    const sampleRows = samples.filter((row) => row.categoryId === category.id);
    presetsByCategory.set(category.id, {
      assetTypes: vocab("asset_types").map((item) => item.label),
      customFields: ownFields.flatMap((field) => {
        const entity = LEGACY_ENTITY[field.entity.key];
        if (!entity || !field.label || !field.type) return [];
        const type = field.type === "TEXT" || field.type === "NUMBER" || field.type === "DATE" || field.type === "SELECT" || field.type === "PHOTO" ? field.type : null;
        if (!type) return [];
        return [{ entity, key: field.key, label: field.label, type, options: field.options.map((option) => option.value) }];
      }),
      checklists: checklists
        .filter((list) => list.categoryId === category.id)
        .map((list) => ({ name: list.name, kind: list.kind, items: list.items.map((item) => ({ id: item.itemKey, label: item.label })) })),
      scheduleKinds: vocab("schedule_kinds").map((item) => ({
        key: item.key,
        label: item.label,
        ...(item.tone === "accent" || item.tone === "warning" || item.tone === "success" ? { tone: item.tone } : {}),
        ...(item.minutes ? { minutes: item.minutes } : {}),
      })),
      stations: vocab("stations").map((item) => ({ key: item.key, label: item.label })),
      dashboard: vocab("dashboard_widgets").map((item) => item.key),
      ledger: { ...(income.length ? { income } : {}), ...(expense.length ? { expense } : {}) },
      sample: presetFromSamples(sampleRows),
    });
  }
  const nodes: CategoryNode[] = categories.map((category) => ({
    ...category,
    terminology: Object.fromEntries(termValues.filter((row) => row.categoryId === category.id).map((row) => [row.termKey, row.value])),
    presets: presetsByCategory.get(category.id) ?? {},
  }));
  return {
    loadedAt: Date.now(),
    nodes,
    moduleDefs,
    needs,
    fields: fieldDefs.map((field) => ({
      scopeKey: field.scopeKey,
      categoryId: field.categoryId,
      tenantId: field.tenantId,
      entityKey: field.entity.key,
      key: field.key,
      label: field.label,
      type: field.type,
      builtIn: field.builtIn,
      required: field.required,
      visible: field.visible,
      sortOrder: field.sortOrder,
      section: field.section,
      showInList: field.showInList,
      refEntityKey: field.refEntity?.key ?? null,
      placeholder: field.placeholder,
      help: field.help,
      options: field.options.map((option) => ({ value: option.value, label: option.label, sortOrder: option.sortOrder })),
    })),
    terms: termValues.map((row) => ({ scopeKey: row.scopeKey, categoryId: row.categoryId, tenantId: row.tenantId, key: row.termKey, value: row.value })),
    termDefaults: Object.fromEntries(termDefs.map((row) => [row.key, row.defaultValue])),
    vocabLists: vocabLists.map((list) => ({ key: list.key, replace: list.replace })),
    vocab: vocabItems.map((item) => ({
      scopeKey: item.scopeKey,
      categoryId: item.categoryId,
      tenantId: item.tenantId,
      listKey: item.listKey,
      key: item.key,
      label: item.label,
      tone: item.tone,
      minutes: item.minutes,
      sortOrder: item.sortOrder,
      visible: item.visible,
    })),
    nav: navEntries.map((entry) => ({
      scopeKey: entry.scopeKey,
      categoryId: entry.categoryId,
      tenantId: entry.tenantId,
      placement: entry.placement,
      key: entry.key,
      parentKey: entry.parentKey,
      kind: entry.kind,
      moduleKey: entry.moduleKey,
      route: entry.route,
      label: entry.label,
      icon: entry.icon,
      subtitle: entry.subtitle,
      permission: entry.permission,
      sortOrder: entry.sortOrder,
      visible: entry.visible,
    })),
    samples,
    resolved: new Map(),
  };
}

async function current(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.loadedAt < TTL_MS) return snapshot;
  loading ??= load().finally(() => {
    loading = null;
  });
  snapshot = await loading;
  return snapshot;
}

const tenantOverlay = new Map<string, { at: number; fields: FieldLayer[]; terms: TermLayer[]; vocab: VocabLayer[]; nav: NavLayer[] }>();

export function invalidateCatalog() {
  snapshot = null;
  tenantCategory.clear();
  tenantOverlay.clear();
}

export function invalidateTenantConfig(tenantId: string) {
  tenantOverlay.delete(tenantId);
  tenantCategory.delete(tenantId);
}

export async function tenantConfigRows(tenantId: string) {
  const hit = tenantOverlay.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const [fieldDefs, termValues, vocabItems, navEntries] = await Promise.all([
    prisma.fieldDef.findMany({ where: { tenantId }, include: { options: true, entity: true, refEntity: true } }),
    prisma.termValue.findMany({ where: { tenantId } }),
    prisma.vocabItem.findMany({ where: { tenantId } }),
    prisma.navEntry.findMany({ where: { tenantId } }),
  ]);
  const rows = {
    at: Date.now(),
    fields: fieldDefs.map((field) => ({
      scopeKey: field.scopeKey,
      categoryId: field.categoryId,
      tenantId: field.tenantId,
      entityKey: field.entity.key,
      key: field.key,
      label: field.label,
      type: field.type,
      builtIn: field.builtIn,
      required: field.required,
      visible: field.visible,
      sortOrder: field.sortOrder,
      section: field.section,
      showInList: field.showInList,
      refEntityKey: field.refEntity?.key ?? null,
      placeholder: field.placeholder,
      help: field.help,
      options: field.options.map((option) => ({ value: option.value, label: option.label, sortOrder: option.sortOrder })),
    })),
    terms: termValues.map((row) => ({ scopeKey: row.scopeKey, categoryId: row.categoryId, tenantId: row.tenantId, key: row.termKey, value: row.value })),
    vocab: vocabItems.map((item) => ({
      scopeKey: item.scopeKey,
      categoryId: item.categoryId,
      tenantId: item.tenantId,
      listKey: item.listKey,
      key: item.key,
      label: item.label,
      tone: item.tone,
      minutes: item.minutes,
      sortOrder: item.sortOrder,
      visible: item.visible,
    })),
    nav: navEntries.map((entry) => ({
      scopeKey: entry.scopeKey,
      categoryId: entry.categoryId,
      tenantId: entry.tenantId,
      placement: entry.placement,
      key: entry.key,
      parentKey: entry.parentKey,
      kind: entry.kind,
      moduleKey: entry.moduleKey,
      route: entry.route,
      label: entry.label,
      icon: entry.icon,
      subtitle: entry.subtitle,
      permission: entry.permission,
      sortOrder: entry.sortOrder,
      visible: entry.visible,
    })),
  };
  tenantOverlay.set(tenantId, rows);
  return rows;
}

export async function catalogNodes() {
  return (await current()).nodes;
}

export async function moduleDefinitions() {
  return (await current()).moduleDefs;
}

export async function needDefinitions() {
  return (await current()).needs;
}

export async function configRows() {
  const state = await current();
  return {
    fields: state.fields,
    terms: state.terms,
    termDefaults: state.termDefaults,
    vocabLists: state.vocabLists,
    vocab: state.vocab,
    nav: state.nav,
  };
}

export async function resolvedCategory(categoryId: string): Promise<ResolvedCategory> {
  const state = await current();
  const cached = state.resolved.get(categoryId);
  if (cached) return cached;
  const chain = categoryChain(state.nodes, categoryId);
  if (chain.length === 0) throw new HttpError(404, "Categoria non trovata");
  const resolved = resolveCategory(chain, state.moduleDefs, state.needs);
  state.resolved.set(categoryId, resolved);
  return resolved;
}

export async function categoryOfTenant(tenantId: string): Promise<ResolvedCategory> {
  const hit = tenantCategory.get(tenantId);
  let categoryId = hit && Date.now() - hit.at < TTL_MS ? hit.categoryId : null;
  if (!categoryId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { categoryId: true } });
    if (!tenant) throw new HttpError(404, "Negozio non trovato");
    categoryId = tenant.categoryId;
    tenantCategory.set(tenantId, { categoryId, at: Date.now() });
  }
  return resolvedCategory(categoryId);
}

export async function publicCategories() {
  const nodes = (await catalogNodes()).filter((node) => node.active);
  const resolved = await Promise.all(nodes.map((node) => resolvedCategory(node.id)));
  const view = (node: CategoryNode) => {
    const full = resolved.find((item) => item.id === node.id)!;
    return {
      id: node.id,
      key: node.key,
      label: node.label,
      description: node.description,
      icon: node.icon,
      accent: full.accent,
      image: full.image,
      ownImage: node.image,
    };
  };
  return nodes
    .filter((node) => !node.parentId)
    .map((root) => ({ ...view(root), children: nodes.filter((node) => node.parentId === root.id).map(view) }));
}

export async function publicPlan(categoryId: string) {
  const node = (await catalogNodes()).find((item) => item.id === categoryId);
  if (!node?.active) throw new HttpError(404, "Categoria non disponibile");
  const category = await resolvedCategory(categoryId);
  return {
    id: category.id,
    label: category.label,
    terminology: category.terminology,
    needs: category.needs,
    modules: category.modules.map((module) => ({
      key: module.key,
      label: module.label,
      description: module.description,
      pitch: module.pitch,
      icon: module.icon,
      priceCents: module.priceCents,
      trialDays: module.trialDays,
      requires: module.requires,
      free: module.free,
      recommended: module.recommended,
      sortOrder: module.sortOrder,
    })),
  };
}
