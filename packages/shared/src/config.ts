/** Three-level config: base, then the category chain from the root, then the shop. Null cells inherit. */

export interface Scoped {
  scopeKey: string;
  categoryId: string | null;
  tenantId: string | null;
}

export function scopeRank(row: Scoped, chain: readonly string[]): number | null {
  if (row.scopeKey === "base" || (!row.categoryId && !row.tenantId)) return 0;
  if (row.tenantId) return chain.length + 1;
  if (!row.categoryId) return null;
  const index = chain.indexOf(row.categoryId);
  return index === -1 ? null : index + 1;
}

function pick<T>(current: T, next: T | null | undefined): T {
  return next === null || next === undefined ? current : next;
}

export interface FieldLayer extends Scoped {
  entityKey: string;
  key: string;
  label: string | null;
  type: string | null;
  builtIn: boolean;
  required: boolean | null;
  visible: boolean | null;
  sortOrder: number | null;
  section: string | null;
  showInList: boolean | null;
  refEntityKey: string | null;
  placeholder: string | null;
  help: string | null;
  options: Array<{ value: string; label: string; sortOrder: number }>;
}

export interface ResolvedField {
  entityKey: string;
  key: string;
  label: string;
  type: string;
  builtIn: boolean;
  required: boolean;
  visible: boolean;
  sortOrder: number;
  section: string | null;
  showInList: boolean;
  refEntityKey: string | null;
  placeholder: string | null;
  help: string | null;
  options: Array<{ value: string; label: string; sortOrder: number }>;
}

function mergeField(base: FieldLayer, over: FieldLayer): FieldLayer {
  return {
    ...base,
    ...over,
    label: pick(base.label, over.label),
    type: pick(base.type, over.type),
    builtIn: base.builtIn || over.builtIn,
    required: pick(base.required, over.required),
    visible: pick(base.visible, over.visible),
    sortOrder: pick(base.sortOrder, over.sortOrder),
    section: pick(base.section, over.section),
    showInList: pick(base.showInList, over.showInList),
    refEntityKey: pick(base.refEntityKey, over.refEntityKey),
    placeholder: pick(base.placeholder, over.placeholder),
    help: pick(base.help, over.help),
    options: over.options.length ? over.options : base.options,
  };
}

/** Merge rows that share a natural key. `visible: false` on the winning layer drops the row. */
export function mergeLayers<T extends Scoped & { key: string; visible?: boolean | null }>(
  rows: readonly T[],
  chain: readonly string[],
  keyOf: (row: T) => string,
  apply: (base: T, over: T) => T,
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (scopeRank(row, chain) === null) continue;
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const merged: T[] = [];
  for (const group of groups.values()) {
    const ordered = group.sort((a, b) => (scopeRank(a, chain) ?? 0) - (scopeRank(b, chain) ?? 0));
    let current = ordered[0];
    if (!current) continue;
    for (const next of ordered.slice(1)) current = apply(current, next);
    if (current.visible === false) continue;
    merged.push(current);
  }
  return merged;
}

export function resolveFields(rows: readonly FieldLayer[], chain: readonly string[]): ResolvedField[] {
  return mergeLayers(rows, chain, (row) => `${row.entityKey}:${row.key}`, mergeField)
    .filter((row): row is FieldLayer & { label: string; type: string } => Boolean(row.label && row.type))
    .map((row) => ({
      entityKey: row.entityKey,
      key: row.key,
      label: row.label,
      type: row.type,
      builtIn: row.builtIn,
      required: row.required ?? false,
      visible: row.visible !== false,
      sortOrder: row.sortOrder ?? 0,
      section: row.section,
      showInList: row.showInList ?? false,
      refEntityKey: row.refEntityKey,
      placeholder: row.placeholder,
      help: row.help,
      options: [...row.options].sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export interface VocabLayer extends Scoped {
  listKey: string;
  key: string;
  label: string;
  tone: string | null;
  minutes: number | null;
  sortOrder: number;
  visible: boolean;
}

export interface VocabListMeta {
  key: string;
  replace: boolean;
}

/** Replace-lists keep only the nearest layer that defines something. Merge-lists combine by key. */
export function resolveVocab(lists: readonly VocabListMeta[], rows: readonly VocabLayer[], chain: readonly string[]): Map<string, VocabLayer[]> {
  const replace = new Set(lists.filter((list) => list.replace).map((list) => list.key));
  const result = new Map<string, VocabLayer[]>();
  const byList = new Map<string, VocabLayer[]>();
  for (const row of rows) {
    if (scopeRank(row, chain) === null) continue;
    const list = byList.get(row.listKey);
    if (list) list.push(row);
    else byList.set(row.listKey, [row]);
  }
  for (const [listKey, items] of byList) {
    const applicable = replace.has(listKey) ? nearest(items, chain) : items;
    const merged = mergeLayers(applicable, chain, (row) => row.key, (base, over) => ({
      ...base,
      ...over,
      label: over.label || base.label,
      tone: pick(base.tone, over.tone),
      minutes: pick(base.minutes, over.minutes),
      visible: over.visible,
    })).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    result.set(listKey, merged);
  }
  return result;
}

function nearest<T extends Scoped>(rows: readonly T[], chain: readonly string[]): T[] {
  let best = -1;
  for (const row of rows) best = Math.max(best, scopeRank(row, chain) ?? -1);
  return rows.filter((row) => scopeRank(row, chain) === best);
}

export interface NavLayer extends Scoped {
  placement: "TAB" | "MORE" | "SETTINGS" | "HOME_ACTIONS";
  key: string;
  parentKey: string | null;
  kind: "MODULE" | "ROUTE" | "GROUP" | "LINK";
  moduleKey: string | null;
  route: string | null;
  label: string | null;
  icon: string | null;
  subtitle: string | null;
  permission: string | null;
  sortOrder: number | null;
  visible: boolean | null;
}

export interface ResolvedNav {
  placement: NavLayer["placement"];
  key: string;
  parentKey: string | null;
  kind: NavLayer["kind"];
  moduleKey: string | null;
  route: string | null;
  label: string;
  icon: string;
  subtitle: string | null;
  permission: string | null;
  sortOrder: number;
}

export function resolveNav(rows: readonly NavLayer[], chain: readonly string[]): ResolvedNav[] {
  return mergeLayers(rows, chain, (row) => `${row.placement}:${row.key}`, (base, over) => ({
    ...base,
    ...over,
    parentKey: pick(base.parentKey, over.parentKey),
    moduleKey: pick(base.moduleKey, over.moduleKey),
    route: pick(base.route, over.route),
    label: pick(base.label, over.label),
    icon: pick(base.icon, over.icon),
    subtitle: pick(base.subtitle, over.subtitle),
    permission: pick(base.permission, over.permission),
    sortOrder: pick(base.sortOrder, over.sortOrder),
    visible: pick(base.visible, over.visible),
  }))
    .filter((row): row is NavLayer & { label: string } => Boolean(row.label))
    .map((row) => ({
      placement: row.placement,
      key: row.key,
      parentKey: row.parentKey,
      kind: row.kind,
      moduleKey: row.moduleKey,
      route: row.route,
      label: row.label,
      icon: row.icon ?? "apps-outline",
      subtitle: row.subtitle,
      permission: row.permission,
      sortOrder: row.sortOrder ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface TermLayer extends Scoped {
  key: string;
  value: string;
}

export function resolveTerms(defaults: Record<string, string>, rows: readonly TermLayer[], chain: readonly string[]): Record<string, string> {
  const merged = { ...defaults };
  const won = mergeLayers(
    rows.map((row) => ({ ...row, visible: true as boolean | null })),
    chain,
    (row) => row.key,
    (base, over) => ({ ...base, value: over.value || base.value }),
  );
  for (const row of won) if (row.value.trim()) merged[row.key] = row.value;
  return merged;
}
