import { isModuleKey, MODULE_CODE, type ModuleKey, type StockLocationKind } from "./modules";
import type { Permission } from "./permissions";
import { ledgerCategoriesOf, type LedgerCategories } from "./reports";
import { DEFAULT_ACCENT, mergeTerminology, type Terminology } from "./verticals";

export interface ModuleDefRow {
  key: string;
  label: string;
  description: string;
  pitch: string;
  details: string;
  features: string[];
  icon: string;
  priceCents: number;
  trialDays: number;
  requires: string[];
  sortOrder: number;
  active: boolean;
}

export interface CategoryModuleRow {
  moduleKey: string;
  included: boolean;
  recommended: boolean | null;
  free: boolean | null;
  tab: boolean | null;
  sortOrder: number | null;
  label: string | null;
  description: string | null;
}

export interface CategoryRoleRow {
  name: string;
  owner: boolean;
  permissions: string[];
  sortOrder: number;
}

export interface NeedRow {
  id: string;
  key: string;
  categoryId: string | null;
  label: string;
  description: string;
  icon: string;
  modules: string[];
  sortOrder: number;
  active: boolean;
}

export interface NeedView {
  key: string;
  label: string;
  description: string;
  icon: string;
  modules: ModuleKey[];
}

export interface VocabItem {
  key: string;
  label: string;
  tone?: "accent" | "warning" | "success";
  minutes?: number;
}

export const DEFAULT_SLOT_MINUTES = 60;
const KNOWN_SLOT_MINUTES: Record<string, number> = { REFILL: 90, COLOR: 90, TREATMENT: 60, APPOINTMENT: 60 };

export function slotMinutes(kinds: readonly VocabItem[], kind: string): number {
  return kinds.find((item) => item.key === kind)?.minutes ?? KNOWN_SLOT_MINUTES[kind] ?? DEFAULT_SLOT_MINUTES;
}

export interface Vocab {
  scheduleKinds: VocabItem[];
  stations: VocabItem[];
  dashboard: string[];
  ledger: LedgerCategories;
}

export interface PresetField {
  entity: "CUSTOMER" | "ASSET" | "WORK_ORDER" | "PRODUCT";
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "PHOTO";
  options?: string[];
}

export interface PresetChecklist {
  name: string;
  kind: string;
  items: Array<{ id: string; label: string }>;
}

type StockAt = Array<{ location: string; quantity: number }>;

export interface PresetAsset {
  name: string;
  type?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  customFields?: Record<string, string>;
}

export interface PresetSample {
  customer?: { name: string; phone?: string; city?: string; address?: string };
  stockLocations?: Array<{ name: string; kind: StockLocationKind }>;
  asset?: PresetAsset;
  assets?: PresetAsset[];
  parts?: Array<{ sku: string; name: string; brand?: string; models?: string[]; barcode?: string; price?: number; stock?: StockAt }>;
  workOrder?: string;
  schedule?: string | { title: string; kind?: string; intervalMonths?: number; dueInDays?: number };
  tables?: Array<{ name: string; posX: number; posY: number; seats: number }>;
  modifiers?: Array<{ name: string; priceDelta?: number }>;
  ingredients?: Array<{ name: string; unit: string; sku?: string; category?: string; min?: number; cost?: number; stock?: StockAt }>;
  menu?: Array<{ name: string; category: string; station?: string; price: number; modifiers?: string[] }>;
  suppliers?: Array<{ name: string; phone?: string; email?: string; order?: Array<{ ingredient?: string; description: string; quantity: number; unitPrice: number }> }>;
  shift?: { roleLabel?: string; start: string; end: string };
  order?: { table?: string; covers?: number; lines: Array<{ item: string; quantity?: number; status?: "PENDING" | "SENT" | "READY" | "SERVED" }> };
}

export interface CategoryPresets {
  assetTypes?: string[];
  customFields?: PresetField[];
  checklists?: PresetChecklist[];
  scheduleKinds?: VocabItem[];
  stations?: VocabItem[];
  dashboard?: string[];
  ledger?: Partial<LedgerCategories>;
  sample?: PresetSample;
}

export interface CategoryNode {
  id: string;
  key: string;
  parentId: string | null;
  label: string;
  description: string;
  icon: string;
  accent: string | null;
  image: string | null;
  terminology: unknown;
  presets: unknown;
  sortOrder: number;
  active: boolean;
  modules: CategoryModuleRow[];
  roles: CategoryRoleRow[];
}

export interface CatalogModule {
  key: ModuleKey;
  label: string;
  description: string;
  pitch: string;
  details: string;
  features: string[];
  icon: string;
  route: string;
  permission: Permission;
  priceCents: number;
  trialDays: number;
  requires: ModuleKey[];
  free: boolean;
  recommended: boolean;
  tab: boolean;
  sortOrder: number;
}

export interface ResolvedCategory {
  id: string;
  key: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  image: string | null;
  path: Array<{ id: string; key: string; label: string }>;
  terminology: Terminology;
  presets: CategoryPresets;
  vocab: Vocab;
  modules: CatalogModule[];
  needs: NeedView[];
  roles: CategoryRoleRow[];
}

const FALLBACK_SCHEDULE_KIND: VocabItem = { key: "GENERIC", label: "Altro" };
const FALLBACK_STATION: VocabItem = { key: "MAIN", label: "Generale" };

function asObject<T>(value: unknown): Partial<T> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<T>) : {};
}

function mergeByKey<T>(lists: Array<T[] | undefined>, keyOf: (item: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const list of lists) for (const item of list ?? []) merged.set(keyOf(item), item);
  return [...merged.values()];
}

function mergePresets(chain: CategoryNode[]): CategoryPresets {
  const layers = chain.map((node) => asObject<CategoryPresets>(node.presets));
  let assetTypes: string[] | undefined;
  let dashboard: string[] | undefined;
  let ledgerIncome: string[] | undefined;
  let ledgerExpense: string[] | undefined;
  let sample: PresetSample | undefined;
  for (const presets of layers) {
    if (presets.assetTypes?.length) assetTypes = presets.assetTypes;
    if (presets.dashboard?.length) dashboard = presets.dashboard;
    if (presets.ledger?.income?.length) ledgerIncome = presets.ledger.income;
    if (presets.ledger?.expense?.length) ledgerExpense = presets.ledger.expense;
    if (presets.sample) sample = { ...sample, ...asObject<PresetSample>(presets.sample) };
  }
  return {
    assetTypes: assetTypes ?? [],
    customFields: mergeByKey(layers.map((presets) => presets.customFields), (field) => `${field.entity}:${field.key}`),
    checklists: mergeByKey(layers.map((presets) => presets.checklists), (checklist) => checklist.name),
    scheduleKinds: mergeByKey(layers.map((presets) => presets.scheduleKinds), (item) => item.key),
    stations: mergeByKey(layers.map((presets) => presets.stations), (item) => item.key),
    dashboard: dashboard ?? [],
    ledger: { income: ledgerIncome ?? [], expense: ledgerExpense ?? [] },
    sample,
  };
}

function vocabOf(presets: CategoryPresets): Vocab {
  const scheduleKinds = [...(presets.scheduleKinds ?? [])];
  if (!scheduleKinds.some((item) => item.key === FALLBACK_SCHEDULE_KIND.key)) scheduleKinds.push(FALLBACK_SCHEDULE_KIND);
  const stations = presets.stations?.length ? presets.stations : [FALLBACK_STATION];
  return { scheduleKinds, stations, dashboard: presets.dashboard ?? [], ledger: ledgerCategoriesOf(presets.ledger) };
}

export function resolveCategory(chain: CategoryNode[], moduleDefs: ModuleDefRow[], needs: NeedRow[] = []): ResolvedCategory {
  const leaf = chain[chain.length - 1];
  if (!leaf) throw new Error("Categoria vuota");

  const merged = new Map<string, Partial<CategoryModuleRow> & { hidden?: boolean }>();
  for (const node of chain) {
    for (const row of node.modules) {
      if (!row.included) {
        merged.set(row.moduleKey, { hidden: true });
        continue;
      }
      const found = merged.get(row.moduleKey);
      const previous = found?.hidden ? {} : (found ?? {});
      merged.set(row.moduleKey, {
        recommended: row.recommended ?? previous.recommended,
        free: row.free ?? previous.free,
        tab: row.tab ?? previous.tab,
        sortOrder: row.sortOrder ?? previous.sortOrder,
        label: row.label ?? previous.label,
        description: row.description ?? previous.description,
      });
    }
  }

  // A category sells only the modules its branch lists; an unconfigured branch falls back to the whole catalog.
  const configured = [...merged.values()].some((row) => !row.hidden);
  const modules: CatalogModule[] = [];
  for (const definition of moduleDefs) {
    const key = definition.key;
    const row = merged.get(key);
    if (!definition.active || !isModuleKey(key) || row?.hidden || (configured && !row)) continue;
    modules.push({
      key,
      label: row?.label ?? definition.label,
      description: row?.description ?? definition.description,
      pitch: definition.pitch,
      details: definition.details ?? "",
      features: definition.features ?? [],
      icon: definition.icon,
      route: MODULE_CODE[key].route,
      permission: MODULE_CODE[key].permission,
      priceCents: definition.priceCents,
      trialDays: definition.trialDays,
      requires: definition.requires.filter(isModuleKey),
      free: row?.free ?? definition.priceCents === 0,
      recommended: row ? (row.recommended ?? true) : false,
      tab: row?.tab ?? false,
      sortOrder: row?.sortOrder ?? definition.sortOrder + (row ? 0 : 100),
    });
  }
  modules.sort((a, b) => a.sortOrder - b.sortOrder);

  const nearest = <T>(pick: (node: CategoryNode) => T | null | undefined) => {
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const value = pick(chain[index]!);
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return undefined;
  };

  const chainIds = new Set(chain.map((node) => node.id));
  const available = new Set(modules.map((module) => module.key));
  const presets = mergePresets(chain);

  return {
    id: leaf.id,
    key: leaf.key,
    label: leaf.label,
    description: leaf.description,
    icon: leaf.icon,
    accent: nearest((node) => node.accent) ?? DEFAULT_ACCENT,
    image: nearest((node) => node.image) ?? null,
    path: chain.map((node) => ({ id: node.id, key: node.key, label: node.label })),
    terminology: mergeTerminology(...chain.map((node) => asObject<Terminology>(node.terminology))),
    presets,
    vocab: vocabOf(presets),
    modules,
    needs: needs
      .filter((need) => need.active && (!need.categoryId || chainIds.has(need.categoryId)))
      .sort((a, b) => Number(Boolean(b.categoryId)) - Number(Boolean(a.categoryId)) || a.sortOrder - b.sortOrder)
      .map((need) => ({
        key: need.key,
        label: need.label,
        description: need.description,
        icon: need.icon,
        modules: need.modules.filter((key): key is ModuleKey => isModuleKey(key) && available.has(key)),
      }))
      .filter((need) => need.modules.length > 0),
    roles: [...(nearest((node) => (node.roles.length ? node.roles : null)) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function categoryChain<T extends { id: string; parentId: string | null }>(all: T[], id: string): T[] {
  const chain: T[] = [];
  let current = all.find((node) => node.id === id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? all.find((node) => node.id === current!.parentId) : undefined;
  }
  return chain;
}

type Rankable = Pick<CatalogModule, "key" | "recommended" | "requires">;

export function scoreModules(modules: readonly Rankable[], needs: readonly NeedView[], chosen: readonly string[]): Map<ModuleKey, number> {
  const score = new Map<ModuleKey, number>(modules.map((module) => [module.key, module.recommended ? 1 : 0]));
  for (const need of needs) {
    if (!chosen.includes(need.key)) continue;
    for (const key of need.modules) if (score.has(key)) score.set(key, score.get(key)! + 3);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const module of modules) {
      const value = score.get(module.key) ?? 0;
      for (const required of module.requires) {
        if (value > 0 && score.has(required) && score.get(required)! < value) {
          score.set(required, value);
          changed = true;
        }
      }
    }
  }
  return score;
}

export function planModules<T extends Rankable & Pick<CatalogModule, "free" | "sortOrder">>(
  modules: readonly T[],
  needs: readonly NeedView[],
  chosen: readonly string[],
) {
  const score = scoreModules(modules, needs, chosen);
  const withScore = modules.map((module) => ({ ...module, score: score.get(module.key) ?? 0 }));
  const paid = withScore.filter((module) => !module.free);
  return {
    included: withScore.filter((module) => module.free),
    suggested: paid.filter((module) => module.score > 0).sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder),
    others: paid.filter((module) => module.score === 0),
  };
}
