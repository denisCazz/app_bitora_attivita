import type { NeedView, Vocab, VocabItem } from "./catalog";
import { isModuleKey, type ModuleKey } from "./modules";
import { activitySetupSchema, type ActivitySetup } from "./schemas";
import { mergeTerminology, TERMINOLOGY_KEYS, type Terminology } from "./verticals";

export const GENERIC_CATEGORY_KEY = "generic";

export interface ActivityProposal extends ActivitySetup {
  trials: ModuleKey[];
}

export interface TenantActivityPresets {
  assetTypes?: string[];
  scheduleKinds?: VocabItem[];
  stations?: VocabItem[];
}

type TrialModule = { key: ModuleKey; free: boolean; trialDays: number; requires: readonly ModuleKey[] };

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function unwrap(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const fenced = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(fenced) as unknown;
  } catch {
    return null;
  }
}

function snake(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z][a-z0-9_]{0,39}$/.test(key) ? key : null;
}

function vocab(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[A-Z][A-Z0-9_]{1,39}$/.test(key) ? key : null;
}

function strings(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    const text = clip(item, length);
    if (text.length >= 2 && !items.includes(text)) items.push(text);
    if (items.length >= max) break;
  }
  return items;
}

function terminologyOf(value: unknown): Terminology {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const picked: Partial<Terminology> = {};
  for (const key of TERMINOLOGY_KEYS) {
    const text = clip(source[key], 40);
    if (text.length >= 2) picked[key] = text;
  }
  return mergeTerminology(picked);
}

function fieldsOf(value: unknown): ActivitySetup["customFields"] {
  if (!Array.isArray(value)) return [];
  const fields: ActivitySetup["customFields"] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const field = item as Record<string, unknown>;
    const entity = field.entity;
    const key = snake(field.key);
    const label = clip(field.label, 40);
    const type = field.type;
    if (entity !== "CUSTOMER" && entity !== "ASSET" && entity !== "WORK_ORDER" && entity !== "PRODUCT") continue;
    if (!key || label.length < 2) continue;
    if (type !== "TEXT" && type !== "NUMBER" && type !== "DATE" && type !== "SELECT" && type !== "PHOTO") continue;
    const id = `${entity}:${key}`;
    if (seen.has(id)) continue;
    const options = strings(field.options, 12, 40);
    if (type === "SELECT" && options.length < 2) continue;
    seen.add(id);
    fields.push({ entity, key, label, type, ...(options.length ? { options } : {}) });
    if (fields.length >= 8) break;
  }
  return fields;
}

function listsOf(value: unknown): ActivitySetup["checklists"] {
  if (!Array.isArray(value)) return [];
  const lists: ActivitySetup["checklists"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const list = item as Record<string, unknown>;
    const name = clip(list.name, 60);
    const kind = vocab(list.kind);
    if (name.length < 2 || !kind || !Array.isArray(list.items)) continue;
    const items: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    for (const row of list.items) {
      if (!row || typeof row !== "object") continue;
      const entry = row as Record<string, unknown>;
      const id = snake(entry.id);
      const label = clip(entry.label, 80);
      if (!id || label.length < 2 || seen.has(id)) continue;
      seen.add(id);
      items.push({ id, label });
      if (items.length >= 8) break;
    }
    if (!items.length || lists.some((existing) => existing.name === name)) continue;
    lists.push({ name, kind, items });
    if (lists.length >= 3) break;
  }
  return lists;
}

function kindsOf(value: unknown): ActivitySetup["scheduleKinds"] {
  if (!Array.isArray(value)) return [];
  const kinds: ActivitySetup["scheduleKinds"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const kind = item as Record<string, unknown>;
    const key = vocab(kind.key);
    const label = clip(kind.label, 40);
    if (!key || label.length < 2 || kinds.some((existing) => existing.key === key)) continue;
    const tone = kind.tone === "accent" || kind.tone === "warning" || kind.tone === "success" ? kind.tone : undefined;
    kinds.push({ key, label, ...(tone ? { tone } : {}) });
    if (kinds.length >= 6) break;
  }
  return kinds;
}

function stationsOf(value: unknown): ActivitySetup["stations"] {
  if (!Array.isArray(value)) return [];
  const stations: ActivitySetup["stations"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const station = item as Record<string, unknown>;
    const key = vocab(station.key);
    const label = clip(station.label, 40);
    if (!key || label.length < 2 || stations.some((existing) => existing.key === key)) continue;
    stations.push({ key, label });
    if (stations.length >= 6) break;
  }
  return stations;
}

function modulesOf(value: unknown): ModuleKey[] {
  if (!Array.isArray(value)) return [];
  const keys: ModuleKey[] = [];
  for (const item of value) {
    const raw = typeof item === "string" ? item : item && typeof item === "object" && "key" in item ? (item as { key: unknown }).key : "";
    const key = typeof raw === "string" ? raw : "";
    if (!isModuleKey(key) || key === "dashboard" || key === "settings" || keys.includes(key)) continue;
    keys.push(key);
    if (keys.length >= 4) break;
  }
  return keys;
}

export function parseActivitySetup(raw: unknown): ActivitySetup {
  const value = unwrap(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Non sono riuscito a leggere la configurazione. Riprova.");
  const record = value as Record<string, unknown>;
  const activity = clip(record.activity, 40);
  const summary = clip(record.summary, 280);
  if (activity.length < 2 || summary.length < 2) throw new Error("Non sono riuscito a capire il mestiere. Descrivilo con qualche dettaglio in più.");
  const parsed = activitySetupSchema.safeParse({
    activity,
    summary,
    terminology: terminologyOf(record.terminology),
    assetTypes: strings(record.assetTypes, 8, 40),
    customFields: fieldsOf(record.customFields),
    checklists: listsOf(record.checklists),
    scheduleKinds: kindsOf(record.scheduleKinds),
    stations: stationsOf(record.stations),
    modules: modulesOf(record.modules),
  });
  if (!parsed.success) throw new Error("Non sono riuscito a leggere la configurazione. Riprova.");
  return parsed.data;
}

export function needsFromModules(keys: readonly string[]): NeedView[] {
  return keys
    .filter((key): key is ModuleKey => isModuleKey(key))
    .map((key) => ({ key, label: key, description: "", icon: "sparkles-outline", modules: [key] }));
}

export function trialKeys(modules: readonly TrialModule[], picks: readonly string[], limit?: number): ModuleKey[] {
  const byKey = new Map(modules.map((module) => [module.key, module]));
  const direct = picks.filter((key): key is ModuleKey => isModuleKey(key) && byKey.has(key));

  function close(seed: readonly ModuleKey[]): ModuleKey[] {
    const selected = new Set(seed);
    let changed = true;
    while (changed) {
      changed = false;
      for (const module of modules) {
        if (!selected.has(module.key)) continue;
        for (const required of module.requires) {
          if (byKey.has(required) && !selected.has(required)) {
            selected.add(required);
            changed = true;
          }
        }
      }
    }
    return [...selected];
  }

  function paid(keys: readonly ModuleKey[]): ModuleKey[] {
    return keys.filter((key) => {
      const module = byKey.get(key);
      return Boolean(module && !module.free && module.trialDays > 0);
    });
  }

  let chosen = limit === undefined ? close(direct) : [];
  if (limit !== undefined) {
    for (const key of direct) {
      const next = close([...chosen, key]);
      if (paid(next).length > limit) continue;
      chosen = next;
    }
  }
  const billable = paid(chosen);
  const ordered = direct.filter((key) => billable.includes(key));
  return [...ordered, ...billable.filter((key) => !ordered.includes(key))];
}

export function overlayVocab(base: Vocab, presets?: TenantActivityPresets | null): Vocab {
  if (!presets) return base;
  const scheduleKinds = presets.scheduleKinds?.length
    ? [...presets.scheduleKinds, ...base.scheduleKinds.filter((item) => !presets.scheduleKinds!.some((kind) => kind.key === item.key))]
    : base.scheduleKinds;
  if (scheduleKinds.length && !scheduleKinds.some((item) => item.key === "GENERIC")) scheduleKinds.push({ key: "GENERIC", label: "Altro" });
  return {
    scheduleKinds,
    stations: presets.stations?.length ? presets.stations : base.stations,
    dashboard: base.dashboard,
  };
}
