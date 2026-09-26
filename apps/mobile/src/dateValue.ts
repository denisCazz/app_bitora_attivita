/** Le form tengono le date come testo locale: "2026-09-26", "2026-09-26T09:00" o "09:00". */
export type DateMode = "date" | "datetime" | "time";

const pad = (part: number) => String(part).padStart(2, "0");

export function parseDateValue(value: string | null | undefined, mode: DateMode): Date | null {
  const text = value?.trim();
  if (!text) return null;
  if (mode === "time") {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) return null;
    const date = new Date();
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(text);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 9), Number(match[5] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateValue(date: Date, mode: DateMode): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (mode === "date") return day;
  if (mode === "time") return time;
  return `${day}T${time}`;
}

export function describeDateValue(value: string | null | undefined, mode: DateMode): string {
  const date = parseDateValue(value, mode);
  if (!date) return "";
  if (mode === "time") return formatDateValue(date, "time");
  const day = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return mode === "date" ? day : `${day} · ${formatDateValue(date, "time")}`;
}

/** Valore iniziale del picker quando il campo è vuoto: oggi alle 9, o l'ora piena successiva. */
export function defaultDate(mode: DateMode): Date {
  const date = new Date();
  if (mode === "time") date.setHours(date.getHours() + 1, 0, 0, 0);
  else date.setHours(9, 0, 0, 0);
  return date;
}
