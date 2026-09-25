import { isModuleKey, MODULE_CODE, type ModuleKey, type Vertical } from "./modules";
import type { Permission } from "./permissions";
import { DEFAULT_ACCENT, mergeTerminology, type Terminology } from "./verticals";

export interface ModuleDefRow {
  key: string;
  label: string;
  description: string;
  pitch: string;
  icon: string;
  priceCents: number;
  trialDays: number;
  sortOrder: number;
  active: boolean;
}

export interface CategoryModuleRow {
  moduleKey: string;
  included: boolean;
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

export interface PresetField {
  entity: "CUSTOMER" | "ASSET" | "WORK_ORDER" | "PRODUCT";
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "PHOTO";
  options?: string[];
}

export interface PresetChecklist {
  name: string;
  kind: "ANNUAL_CLEANING" | "FLUE_CHECK" | "HACCP" | "GENERIC";
  items: Array<{ id: string; label: string }>;
}

export interface PresetSample {
  asset?: { name: string; type?: string; brand?: string; model?: string; serialNumber?: string; customFields?: Record<string, string> };
  parts?: Array<{ sku: string; name: string; brand?: string; models?: string[]; barcode?: string; price?: number }>;
  workOrder?: string;
  schedule?: string;
}

export interface CategoryPresets {
  assetTypes?: string[];
  customFields?: PresetField[];
  checklists?: PresetChecklist[];
  sample?: PresetSample;
}

export interface CategoryNode {
  id: string;
  key: string;
  parentId: string | null;
  family: Vertical;
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
  icon: string;
  route: string;
  permission: Permission;
  priceCents: number;
  trialDays: number;
  free: boolean;
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
  family: Vertical;
  path: Array<{ id: string; key: string; label: string }>;
  terminology: Terminology;
  presets: CategoryPresets;
  modules: CatalogModule[];
  roles: CategoryRoleRow[];
}

function asObject<T>(value: unknown): Partial<T> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<T>) : {};
}

function mergePresets(chain: CategoryNode[]): CategoryPresets {
  const fields = new Map<string, PresetField>();
  const checklists = new Map<string, PresetChecklist>();
  let assetTypes: string[] | undefined;
  let sample: PresetSample | undefined;
  for (const node of chain) {
    const presets = asObject<CategoryPresets>(node.presets);
    if (presets.assetTypes?.length) assetTypes = presets.assetTypes;
    for (const field of presets.customFields ?? []) fields.set(`${field.entity}:${field.key}`, field);
    for (const checklist of presets.checklists ?? []) checklists.set(checklist.name, checklist);
    if (presets.sample) sample = presets.sample;
  }
  return { assetTypes: assetTypes ?? [], customFields: [...fields.values()], checklists: [...checklists.values()], sample };
}

export function resolveCategory(chain: CategoryNode[], moduleDefs: ModuleDefRow[]): ResolvedCategory {
  const leaf = chain[chain.length - 1];
  if (!leaf) throw new Error("Categoria vuota");

  const merged = new Map<string, Partial<CategoryModuleRow>>();
  for (const node of chain) {
    for (const row of node.modules) {
      if (!row.included) {
        merged.delete(row.moduleKey);
        continue;
      }
      const previous = merged.get(row.moduleKey) ?? {};
      merged.set(row.moduleKey, {
        free: row.free ?? previous.free,
        tab: row.tab ?? previous.tab,
        sortOrder: row.sortOrder ?? previous.sortOrder,
        label: row.label ?? previous.label,
        description: row.description ?? previous.description,
      });
    }
  }

  const modules: CatalogModule[] = [];
  for (const [key, row] of merged) {
    const definition = moduleDefs.find((item) => item.key === key);
    if (!definition?.active || !isModuleKey(key)) continue;
    modules.push({
      key,
      label: row.label ?? definition.label,
      description: row.description ?? definition.description,
      pitch: definition.pitch,
      icon: definition.icon,
      route: MODULE_CODE[key].route,
      permission: MODULE_CODE[key].permission,
      priceCents: definition.priceCents,
      trialDays: definition.trialDays,
      free: row.free ?? definition.priceCents === 0,
      tab: row.tab ?? false,
      sortOrder: row.sortOrder ?? definition.sortOrder,
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

  return {
    id: leaf.id,
    key: leaf.key,
    label: leaf.label,
    description: leaf.description,
    icon: leaf.icon,
    accent: nearest((node) => node.accent) ?? DEFAULT_ACCENT,
    image: nearest((node) => node.image) ?? null,
    family: leaf.family,
    path: chain.map((node) => ({ id: node.id, key: node.key, label: node.label })),
    terminology: mergeTerminology(...chain.map((node) => asObject<Terminology>(node.terminology))),
    presets: mergePresets(chain),
    modules,
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
