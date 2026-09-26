export interface ShiftItem {
  id: string;
  roleLabel?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  user: { id: string; name: string };
}

export type ShiftView = "month" | "week";

const DAY_MS = 86_400_000;

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dayKey(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function sameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

export function inMonth(date: Date, anchor: Date) {
  return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
}

export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function weekDays(anchor: Date) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthCells(anchor: Date) {
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const end = addDays(startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 6);
  const cells: Date[] = [];
  for (let day = start; day.getTime() <= end.getTime(); day = addDays(day, 1)) cells.push(day);
  return cells;
}

export function rangeFor(view: ShiftView, anchor: Date) {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { from: start, to: addDays(start, 7) };
  }
  const cells = monthCells(anchor);
  return { from: cells[0]!, to: addDays(cells[cells.length - 1]!, 1) };
}

export function shiftMonth(anchor: Date, delta: number) {
  const target = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(anchor.getDate(), last));
}

export function overlapsDay(shift: { startsAt: string; endsAt: string }, day: Date) {
  const start = startOfDay(day).getTime();
  return new Date(shift.startsAt).getTime() < start + DAY_MS && new Date(shift.endsAt).getTime() > start;
}

export function shiftsOnDay(shifts: ShiftItem[], day: Date) {
  return shifts.filter((shift) => overlapsDay(shift, day)).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function crossesMidnight(startsAt: string, endsAt: string) {
  return dayKey(new Date(startsAt)) !== dayKey(new Date(endsAt));
}

export interface DaySlice {
  startMin: number;
  endMin: number;
}

export function sliceOnDay(shift: { startsAt: string; endsAt: string }, day: Date): DaySlice | null {
  const dayStart = startOfDay(day).getTime();
  const start = new Date(shift.startsAt).getTime();
  const end = new Date(shift.endsAt).getTime();
  if (end <= dayStart || start >= dayStart + DAY_MS) return null;
  const startMin = Math.max(0, (start - dayStart) / 60_000);
  const endMin = Math.min(24 * 60, (end - dayStart) / 60_000);
  if (endMin - startMin < 1) return null;
  return { startMin, endMin };
}

export function timeWindow(shifts: Array<{ startsAt: string; endsAt: string }>, days: Date[]) {
  let min = 8 * 60;
  let max = 20 * 60;
  for (const day of days) {
    const dayStart = startOfDay(day).getTime();
    for (const shift of shifts) {
      const slice = sliceOnDay(shift, day);
      if (!slice) continue;
      const startedToday = new Date(shift.startsAt).getTime() >= dayStart;
      // A tail from yesterday (00:00–06:00) stays off the shared axis; the day cell calls it out.
      if (!startedToday && slice.endMin <= 6 * 60) continue;
      const startMin = startedToday ? slice.startMin : Math.max(slice.startMin, 6 * 60);
      min = Math.min(min, Math.floor(startMin / 60) * 60);
      max = Math.max(max, Math.ceil(slice.endMin / 60) * 60);
    }
  }
  return { start: Math.max(0, min), end: Math.min(24 * 60, Math.max(max, min + 60)) };
}

export function packLanes<T extends { startMin: number; endMin: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMin + 0.01);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    return { item, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((entry) => ({ ...entry, lanes }));
}

export function peopleOf(shifts: ShiftItem[]) {
  const map = new Map<string, string>();
  for (const shift of shifts) map.set(shift.user.id, shift.user.name);
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id));
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function monthTitle(date: Date) {
  const label = date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dayTitle(date: Date) {
  const label = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function weekTitle(anchor: Date) {
  const days = weekDays(anchor);
  const start = days[0]!;
  const end = days[6]!;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const left = start.toLocaleDateString("it-IT", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" }).replace(".", "");
  const right = end.toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");
  const year = end.getFullYear() !== new Date().getFullYear() ? ` ${end.getFullYear()}` : "";
  return `${left} – ${right}${year}`;
}

export function clock(value: string) {
  return new Date(value).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function hhmm(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const parsed = new Date(year, month - 1, date);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== date) return null;
  return parsed;
}

function parseClock(value: string) {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function fieldsFromShift(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return { day: dayKey(start), start: hhmm(start), end: hhmm(end) };
}

export function composeShift(day: string, start: string, end: string) {
  const date = parseDay(day);
  const from = parseClock(start);
  const to = parseClock(end);
  if (!date || !from || !to) return null;
  const startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), from.hour, from.minute);
  const endsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), to.hour, to.minute);
  if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), overnight: dayKey(startsAt) !== dayKey(endsAt) };
}

export function periodSummary(shifts: ShiftItem[], personName?: string) {
  if (personName) {
    const who = firstName(personName);
    if (shifts.length === 0) return `Nessun turno di ${who}`;
    return shifts.length === 1 ? `1 turno di ${who}` : `${shifts.length} turni di ${who}`;
  }
  if (shifts.length === 0) return "Nessun turno in questo periodo";
  const people = new Set(shifts.map((shift) => shift.user.id)).size;
  const turni = shifts.length === 1 ? "1 turno" : `${shifts.length} turni`;
  const persone = people === 1 ? "1 persona" : `${people} persone`;
  return `${turni} · ${persone}`;
}
