export const PAYROLL_TIME_ZONE = "Europe/Rome";
export const PAYROLL_CATEGORY = "Personale";
export const DEFAULT_WEEKLY_HOURS = 40;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface PayrollShift {
  userId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
}

export interface PayrollPerson {
  userId: string;
  name: string;
  roleName: string;
  hourlyRate: number | null;
  overtimeRate: number | null;
  weeklyHours: number;
}

export interface PayrollLine {
  userId: string;
  name: string;
  roleName: string;
  hourlyRate: number | null;
  overtimeRate: number | null;
  weeklyHours: number;
  ordinaryHours: number;
  overtimeHours: number;
  amount: number;
}

export interface PayrollReport {
  month: string;
  from: string;
  to: string;
  ordinaryHours: number;
  overtimeHours: number;
  amount: number;
  lines: PayrollLine[];
}

interface RomeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function romeParts(date: Date): RomeParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: PAYROLL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((part) => part.type === type)?.value ?? "0");
  let year = pick("year");
  let month = pick("month");
  let day = pick("day");
  let hour = pick("hour");
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day) + 86_400_000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return { year, month, day, hour, minute: pick("minute"), second: pick("second") };
}

function offsetMs(date: Date) {
  const parts = romeParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function romeInstant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wall;
  for (let step = 0; step < 3; step += 1) instant = wall - offsetMs(new Date(instant));
  return instant;
}

function addCivilDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function payrollMonthOf(date: Date) {
  const parts = romeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function addPayrollMonths(month: string, delta: number) {
  const bounds = monthBounds(month);
  const parts = romeParts(bounds.from);
  const next = new Date(Date.UTC(parts.year, parts.month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function payrollMonthsCovering(from: Date, to: Date) {
  const end = new Date(to.getTime() - 1);
  const months: string[] = [];
  let month = payrollMonthOf(from);
  const last = payrollMonthOf(end < from ? from : end);
  for (let guard = 0; guard < 8; guard += 1) {
    months.push(month);
    if (month === last) break;
    month = addPayrollMonths(month, 1);
  }
  return months;
}

export function monthBounds(month: string) {
  if (!MONTH.test(month)) throw new Error("Mese non valido");
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const from = romeInstant(year, mon, 1);
  const next = mon === 12 ? { year: year + 1, month: 1 } : { year, month: mon + 1 };
  const to = romeInstant(next.year, next.month, 1);
  return { from: new Date(from), to: new Date(to) };
}

export function payrollMonthLabel(month: string) {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: PAYROLL_TIME_ZONE }).format(monthBounds(month).from);
}

export function payrollCategory(expenseLabels: readonly string[]) {
  const hit = expenseLabels.find((label) => /personale|stipend|salari|dipendent/i.test(label));
  return hit ?? PAYROLL_CATEGORY;
}

export function payrollDescription(line: { name: string; ordinaryHours: number; overtimeHours: number; hourlyRate: number; overtimeRate: number }) {
  const hours = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
  const euro = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ordinary = `${hours.format(line.ordinaryHours)} h × ${euro.format(line.hourlyRate)} €`;
  const extra = line.overtimeHours > 0 ? ` + ${hours.format(line.overtimeHours)} h straord. × ${euro.format(line.overtimeRate)} €` : "";
  return `Stipendio ${line.name} · ${ordinary}${extra}`.slice(0, 300);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function hoursOf(ms: number) {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function nextWeekStart(ms: number) {
  const parts = romeParts(new Date(ms));
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const fromMonday = (weekday + 6) % 7;
  const atMondayMidnight = fromMonday === 0 && parts.hour === 0 && parts.minute === 0 && parts.second === 0;
  const add = atMondayMidnight ? 7 : 7 - fromMonday;
  const target = addCivilDays(parts.year, parts.month, parts.day, add);
  return romeInstant(target.year, target.month, target.day);
}

function nextBoundary(ms: number, monthFrom: number, monthTo: number) {
  let next = nextWeekStart(ms);
  if (ms < monthFrom && monthFrom < next) next = monthFrom;
  if (ms < monthTo && monthTo < next) next = monthTo;
  return next;
}

function workedInterval(shift: PayrollShift, now: number): [number, number] | null {
  if (shift.status === "CANCELLED") return null;
  const start = new Date(shift.startsAt).getTime();
  let end = new Date(shift.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (shift.status !== "DONE") end = Math.min(end, now);
  if (end <= start) return null;
  return [start, end];
}

function merge(intervals: [number, number][]) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1]) merged.push([start, end]);
    else last[1] = Math.max(last[1], end);
  }
  return merged;
}

function splitHours(intervals: [number, number][], weeklyHours: number, monthFrom: number, monthTo: number) {
  const budget = Math.max(0, Math.round(weeklyHours * 3_600_000));
  const left = new Map<string, number>();
  let ordinaryMs = 0;
  let overtimeMs = 0;
  for (const [start, end] of intervals) {
    let cursor = start;
    while (cursor < end) {
      const next = Math.min(end, nextBoundary(cursor, monthFrom, monthTo));
      if (next <= cursor) break;
      const week = payrollMonthKey(cursor);
      const room = left.get(week) ?? budget;
      const span = next - cursor;
      const ordinary = Math.min(span, room);
      left.set(week, room - ordinary);
      if (cursor >= monthFrom && cursor < monthTo) {
        ordinaryMs += ordinary;
        overtimeMs += span - ordinary;
      }
      cursor = next;
    }
  }
  return { ordinaryHours: hoursOf(ordinaryMs), overtimeHours: hoursOf(overtimeMs) };
}

function payrollMonthKey(ms: number) {
  const parts = romeParts(new Date(ms));
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const fromMonday = (weekday + 6) % 7;
  const monday = addCivilDays(parts.year, parts.month, parts.day, -fromMonday);
  return `${monday.year}-${String(monday.month).padStart(2, "0")}-${String(monday.day).padStart(2, "0")}`;
}

export function buildPayroll(input: { month: string; now?: Date; people: PayrollPerson[]; shifts: PayrollShift[] }): PayrollReport {
  const now = input.now ?? new Date();
  const { from, to } = monthBounds(input.month);
  const monthFrom = from.getTime();
  const monthTo = to.getTime();
  const byUser = new Map<string, [number, number][]>();
  for (const shift of input.shifts) {
    const interval = workedInterval(shift, now.getTime());
    if (!interval) continue;
    const rows = byUser.get(shift.userId) ?? [];
    rows.push(interval);
    byUser.set(shift.userId, rows);
  }

  const lines = input.people.map((person) => {
    const weeklyHours = person.weeklyHours > 0 ? person.weeklyHours : DEFAULT_WEEKLY_HOURS;
    const hours = splitHours(merge(byUser.get(person.userId) ?? []), weeklyHours, monthFrom, monthTo);
    const hourlyRate = person.hourlyRate != null && person.hourlyRate > 0 ? person.hourlyRate : null;
    const overtimeRate = hourlyRate == null ? null : (person.overtimeRate ?? hourlyRate);
    const ordinaryAmount = hourlyRate == null ? 0 : hours.ordinaryHours * hourlyRate;
    const overtimeAmount = overtimeRate == null ? 0 : hours.overtimeHours * overtimeRate;
    return {
      userId: person.userId,
      name: person.name,
      roleName: person.roleName,
      hourlyRate,
      overtimeRate,
      weeklyHours,
      ordinaryHours: hours.ordinaryHours,
      overtimeHours: hours.overtimeHours,
      amount: money(ordinaryAmount + overtimeAmount),
    };
  });
  lines.sort((a, b) => a.name.localeCompare(b.name, "it") || a.userId.localeCompare(b.userId));

  return {
    month: input.month,
    from: from.toISOString(),
    to: to.toISOString(),
    ordinaryHours: money(lines.reduce((sum, line) => sum + line.ordinaryHours, 0)),
    overtimeHours: money(lines.reduce((sum, line) => sum + line.overtimeHours, 0)),
    amount: money(lines.reduce((sum, line) => sum + line.amount, 0)),
    lines,
  };
}
