/** Meal order, then everything else, with "Altro" last. Keys are already normalized. */
const MEAL_ORDER = [
  "antipasti",
  "starter",
  "primi",
  "primi piatti",
  "zuppe",
  "secondi",
  "secondi piatti",
  "piatti",
  "pesce",
  "carne",
  "contorni",
  "insalate",
  "pizze",
  "pizza",
  "panini",
  "dolci",
  "dessert",
  "bevande",
  "bibite",
  "analcolici",
  "vini",
  "vino",
  "birre",
  "birra",
  "cocktail",
  "caffetteria",
  "caffe",
];

export interface MenuModifierDraft {
  name: string;
  priceDelta: number;
}

export interface ProposedMenuItem {
  name: string;
  category: string;
  price: number;
  station?: string;
  available: boolean;
  modifiers: MenuModifierDraft[];
}

export interface CurrentMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  station: string;
  available: boolean;
  modifiers: MenuModifierDraft[];
}

export interface ClassifiedMenuItem extends ProposedMenuItem {
  station: string;
  change: "new" | "update" | "same";
}

export function menuKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPrivateAddress(ip: string): boolean {
  const value = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  if (value.includes(":")) {
    if (value === "::1" || value === "::") return true;
    return value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
  }
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = nums[0]!;
  const b = nums[1]!;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export function publicHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Indirizzo non valido");
  }
  if (url.username || url.password) throw new Error("L'indirizzo non può contenere una password");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Usa un indirizzo http o https");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blocked =
    !host ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    (!host.includes(".") && !isPrivateAddress(host) && !/^\d+$/.test(host)) ||
    /^\d+$/.test(host) ||
    isPrivateAddress(host);
  if (blocked) throw new Error("Questo indirizzo non è raggiungibile");
  return url;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&euro;/gi, "€")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : " ";
    });
}

function mealRank(category: string): number {
  const key = menuKey(category);
  if (key === "altro") return MEAL_ORDER.length + 1;
  const index = MEAL_ORDER.indexOf(key);
  return index === -1 ? MEAL_ORDER.length : index;
}

export function groupMenu<T extends { name: string; category: string; available: boolean }>(items: readonly T[]): Array<{ category: string; items: T[] }> {
  const buckets = new Map<string, { category: string; items: T[] }>();
  for (const item of items) {
    const category = item.category.trim() || "Altro";
    const key = menuKey(category);
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { category, items: [item] });
  }
  const groups = [...buckets.values()];
  groups.sort((left, right) => mealRank(left.category) - mealRank(right.category) || left.category.localeCompare(right.category, "it"));
  for (const group of groups) {
    group.items.sort((left, right) => Number(right.available) - Number(left.available) || left.name.localeCompare(right.name, "it"));
  }
  return groups;
}

export function stationOf(value: string | undefined, stations: ReadonlyArray<{ key: string; label: string }>): string {
  const fallback = stations[0]?.key ?? "MAIN";
  const needle = menuKey(value ?? "");
  if (!needle) return fallback;
  return stations.find((station) => menuKey(station.key) === needle || menuKey(station.label) === needle)?.key ?? fallback;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return roundMoney(amount);
}

function roundMoney(value: number): number | null {
  if (value < 0 || value > 100_000) return null;
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readMenuProposal(value: unknown, stations: ReadonlyArray<{ key: string; label: string }>): { summary: string; items: ProposedMenuItem[] } {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  const record = asRecord(parsed);
  const rawItems = Array.isArray(record?.items) ? record.items : Array.isArray(parsed) ? parsed : [];
  const items: ProposedMenuItem[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const row = asRecord(raw);
    if (!row) continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name.length < 2 || name.length > 120) continue;
    const key = menuKey(name);
    if (!key || seen.has(key)) continue;
    const price = money(row.price);
    if (price === null) continue;
    const category = typeof row.category === "string" && row.category.trim().length >= 2 ? row.category.trim().slice(0, 60) : "Altro";
    const modifiers = readModifiers(row.modifiers);
    seen.add(key);
    items.push({
      name,
      category,
      price,
      station: stationOf(typeof row.station === "string" ? row.station : undefined, stations),
      available: row.available === false ? false : true,
      modifiers,
    });
    if (items.length >= 200) break;
  }
  const summary = typeof record?.summary === "string" ? record.summary.trim().slice(0, 400) : "";
  return { summary, items };
}

function readModifiers(value: unknown): MenuModifierDraft[] {
  if (!Array.isArray(value)) return [];
  const modifiers: MenuModifierDraft[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const row = asRecord(raw);
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    const key = menuKey(name);
    if (name.length < 1 || name.length > 80 || !key || seen.has(key)) continue;
    const price = money(row?.priceDelta ?? 0) ?? 0;
    seen.add(key);
    modifiers.push({ name, priceDelta: price });
    if (modifiers.length >= 20) break;
  }
  return modifiers;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function sameModifiers(current: MenuModifierDraft[], proposed: MenuModifierDraft[]): boolean {
  if (proposed.length === 0) return true;
  const left = current.map((modifier) => `${menuKey(modifier.name)}:${cents(modifier.priceDelta)}`).sort();
  const right = proposed.map((modifier) => `${menuKey(modifier.name)}:${cents(modifier.priceDelta)}`).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function classifyMenuImport(
  current: readonly CurrentMenuItem[],
  proposed: readonly ProposedMenuItem[],
  stations: ReadonlyArray<{ key: string; label: string }>,
): { items: ClassifiedMenuItem[]; missing: Array<{ id: string; name: string; category: string }> } {
  const byName = new Map(current.map((item) => [menuKey(item.name), item]));
  const seen = new Set<string>();
  const items: ClassifiedMenuItem[] = [];
  for (const item of proposed) {
    const key = menuKey(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const station = stationOf(item.station, stations);
    const existing = byName.get(key);
    if (!existing) {
      items.push({ ...item, station, change: "new" });
      continue;
    }
    const category = menuKey(item.category) === menuKey(existing.category) ? existing.category : item.category;
    const unchanged =
      category === existing.category &&
      cents(item.price) === cents(existing.price) &&
      station === existing.station &&
      item.available === existing.available &&
      sameModifiers(existing.modifiers, item.modifiers);
    items.push({
      name: existing.name,
      category,
      price: item.price,
      station,
      available: item.available,
      modifiers: item.modifiers.length ? item.modifiers : existing.modifiers,
      change: unchanged ? "same" : "update",
    });
  }
  const missing = current
    .filter((item) => !seen.has(menuKey(item.name)))
    .map((item) => ({ id: item.id, name: item.name, category: item.category }));
  return { items, missing };
}
