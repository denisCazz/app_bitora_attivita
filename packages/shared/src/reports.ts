export const LEDGER_DAYS = [7, 30, 90] as const;
export type LedgerDays = (typeof LEDGER_DAYS)[number];

export type LedgerFlow = "INCOME" | "EXPENSE";

export interface LedgerCategories {
  income: string[];
  expense: string[];
}

export const DEFAULT_LEDGER: LedgerCategories = {
  income: ["Incassi", "Servizi"],
  expense: ["Fornitori", "Affitto", "Personale", "Utenze"],
};

export interface LedgerReportEntry {
  id: string;
  kind: LedgerFlow;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  paid: boolean;
}

export interface LedgerTrendPoint {
  label: string;
  income: number;
  expense: number;
}

export interface LedgerCategorySeries {
  id: string;
  kind: LedgerFlow;
  category: string;
  amount: number;
  count: number;
  points: Array<{ label: string; value: number }>;
}

export interface LedgerReport {
  days: LedgerDays;
  grain: "day" | "week";
  from: string;
  to: string;
  income: number;
  expense: number;
  balance: number;
  vatCollected: number;
  vatPaid: number;
  toCollect: number;
  toPay: number;
  trend: LedgerTrendPoint[];
  categories: LedgerCategorySeries[];
  entries: LedgerReportEntry[];
}

export interface LedgerReportSource {
  id: string;
  kind: LedgerFlow;
  date: Date | string;
  amount: number;
  vatRate: number;
  category: string;
  description?: string | null;
  paid: boolean;
}

const ROME = "Europe/Rome";
const ENTRY_LIMIT = 80;

export function ledgerSeriesId(kind: LedgerFlow, category: string) {
  return `${kind}:${category.trim().toLocaleLowerCase("it")}`;
}

export function ledgerCategoriesOf(configured?: Partial<LedgerCategories> | null): LedgerCategories {
  const income = cleanLabels(configured?.income);
  const expense = cleanLabels(configured?.expense);
  return {
    income: income.length ? income : DEFAULT_LEDGER.income,
    expense: expense.length ? expense : DEFAULT_LEDGER.expense,
  };
}

export function isLedgerDays(value: number): value is LedgerDays {
  return (LEDGER_DAYS as readonly number[]).includes(value);
}

export function buildLedgerReport(input: {
  days: LedgerDays;
  now: Date;
  presets: LedgerCategories;
  entries: LedgerReportSource[];
  open?: { income: number; expense: number };
}): LedgerReport {
  const presets = ledgerCategoriesOf(input.presets);
  const end = romeDay(input.now);
  const start = addCalendarDays(end, -(input.days - 1));
  const grain = input.days === 90 ? "week" : "day";
  const slots = buckets(start, end, grain);
  const slotIndex = new Map(slots.map((slot, index) => [slot.key, index]));
  const series = new Map<string, { kind: LedgerFlow; category: string; amount: number; count: number; points: number[] }>();

  const ensure = (kind: LedgerFlow, category: string) => {
    const id = ledgerSeriesId(kind, category);
    const found = series.get(id);
    if (found) return found;
    const created = { kind, category, amount: 0, count: 0, points: slots.map(() => 0) };
    series.set(id, created);
    return created;
  };

  for (const category of presets.income) ensure("INCOME", category);
  for (const category of presets.expense) ensure("EXPENSE", category);

  let income = 0;
  let expense = 0;
  let vatCollected = 0;
  let vatPaid = 0;
  const listed: LedgerReportEntry[] = [];

  for (const entry of input.entries) {
    const day = romeDay(entry.date);
    if (day < start || day > end) continue;
    const amount = money(entry.amount);
    if (amount <= 0) continue;
    const names = entry.kind === "INCOME" ? presets.income : presets.expense;
    const category = canonical(names, entry.category);
    const row = ensure(entry.kind, category);
    row.amount += amount;
    row.count += 1;
    const index = slotIndex.get(grain === "week" ? weekStart(day) : day);
    if (index !== undefined) row.points[index] = (row.points[index] ?? 0) + amount;
    if (entry.kind === "INCOME") {
      income += amount;
      vatCollected += vatOf(amount, entry.vatRate);
    } else {
      expense += amount;
      vatPaid += vatOf(amount, entry.vatRate);
    }
    listed.push({
      id: entry.id,
      kind: entry.kind,
      date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
      amount,
      category,
      description: entry.description?.trim() || null,
      paid: entry.paid,
    });
  }

  const trend = slots.map((slot) => ({ label: slot.label, income: 0, expense: 0 }));
  for (const row of series.values()) {
    row.points.forEach((value, index) => {
      const point = trend[index];
      if (!point) return;
      if (row.kind === "INCOME") point.income += value;
      else point.expense += value;
    });
  }

  const categories = ordered(presets, series, slots);
  listed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  return {
    days: input.days,
    grain,
    from: start,
    to: end,
    income: money(income),
    expense: money(expense),
    balance: money(income - expense),
    vatCollected: money(vatCollected),
    vatPaid: money(vatPaid),
    toCollect: money(input.open?.income ?? 0),
    toPay: money(input.open?.expense ?? 0),
    trend: trend.map((point) => ({ label: point.label, income: money(point.income), expense: money(point.expense) })),
    categories,
    entries: listed.slice(0, ENTRY_LIMIT),
  };
}

function ordered(
  presets: LedgerCategories,
  series: Map<string, { kind: LedgerFlow; category: string; amount: number; count: number; points: number[] }>,
  slots: Array<{ label: string }>,
): LedgerCategorySeries[] {
  const used = new Set<string>();
  const result: LedgerCategorySeries[] = [];
  const take = (kind: LedgerFlow, names: string[]) => {
    for (const name of names) {
      const id = ledgerSeriesId(kind, name);
      const row = series.get(id);
      if (!row || used.has(id)) continue;
      used.add(id);
      result.push(toSeries(id, row, slots));
    }
    const extras = [...series.entries()]
      .filter(([id, row]) => row.kind === kind && !used.has(id))
      .sort((a, b) => b[1].amount - a[1].amount || a[1].category.localeCompare(b[1].category, "it"));
    for (const [id, row] of extras) {
      used.add(id);
      result.push(toSeries(id, row, slots));
    }
  };
  take("INCOME", presets.income);
  take("EXPENSE", presets.expense);
  return result;
}

function toSeries(
  id: string,
  row: { kind: LedgerFlow; category: string; amount: number; count: number; points: number[] },
  slots: Array<{ label: string }>,
): LedgerCategorySeries {
  return {
    id,
    kind: row.kind,
    category: row.category,
    amount: money(row.amount),
    count: row.count,
    points: slots.map((slot, index) => ({ label: slot.label, value: money(row.points[index] ?? 0) })),
  };
}

function canonical(presets: string[], raw: string) {
  const trimmed = raw.trim() || "Altro";
  const key = trimmed.toLocaleLowerCase("it");
  return presets.find((item) => item.toLocaleLowerCase("it") === key) ?? trimmed;
}

function cleanLabels(values?: string[]) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values ?? []) {
    const label = value.trim();
    const key = label.toLocaleLowerCase("it");
    if (label.length < 2 || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= 12) break;
  }
  return labels;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function vatOf(amount: number, vatRate: number) {
  return vatRate > 0 ? amount - amount / (1 + vatRate / 100) : 0;
}

export function romeDay(date: Date | string) {
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-CA", { timeZone: ROME, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function addCalendarDays(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, (date ?? 1) + amount)).toISOString().slice(0, 10);
}

function weekStart(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, (month ?? 1) - 1, date ?? 1)).getUTCDay();
  return addCalendarDays(day, weekday === 0 ? -6 : 1 - weekday);
}

function dayLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, (month ?? 1) - 1, date ?? 1)))
    .replace(".", "");
}

function buckets(start: string, end: string, grain: "day" | "week") {
  const slots: Array<{ key: string; label: string }> = [];
  let cursor = grain === "week" ? weekStart(start) : start;
  const last = grain === "week" ? weekStart(end) : end;
  const step = grain === "week" ? 7 : 1;
  while (cursor <= last) {
    slots.push({ key: cursor, label: dayLabel(cursor) });
    cursor = addCalendarDays(cursor, step);
  }
  return slots;
}
