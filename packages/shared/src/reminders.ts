import { z } from "zod";

export const REMINDER_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_PLACEHOLDERS = ["{cliente}", "{cosa}", "{impianto}", "{data}", "{negozio}"] as const;

export const DEFAULT_REMINDER_MESSAGE =
  "Ciao {cliente}, ti ricordiamo che per {impianto} scade «{cosa}» il {data}. Rispondi a questo messaggio per fissare l'appuntamento.\n{negozio}";

export interface ReminderSettings {
  enabled: boolean;
  /** How long before the due date the customer is contacted. */
  daysBefore: number;
  /** Send the email by itself when the customer has an address. WhatsApp always needs a tap. */
  autoEmail: boolean;
  message: string | null;
}

export const REMINDER_DEFAULTS: ReminderSettings = { enabled: false, daysBefore: 30, autoEmail: true, message: null };

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  daysBefore: z.number().int().min(1).max(120),
  autoEmail: z.boolean(),
  message: z.string().trim().max(600).nullable().optional(),
});

export const reminderSentSchema = z.object({ channel: z.enum(REMINDER_CHANNELS) });

export function readReminderSettings(value: unknown): ReminderSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const days = typeof raw.daysBefore === "number" && Number.isInteger(raw.daysBefore) && raw.daysBefore >= 1 && raw.daysBefore <= 120 ? raw.daysBefore : REMINDER_DEFAULTS.daysBefore;
  return {
    enabled: raw.enabled === true,
    daysBefore: days,
    autoEmail: raw.autoEmail !== false,
    message: typeof raw.message === "string" && raw.message.trim() ? raw.message.trim() : null,
  };
}

export interface ReminderVars {
  customerName?: string | null;
  what: string;
  asset?: string | null;
  dueAt: Date;
  business: string;
}

export function reminderDate(date: Date) {
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

export function reminderMessage(template: string | null | undefined, vars: ReminderVars) {
  const first = vars.customerName?.trim().split(/\s+/)[0] ?? "";
  const values: Record<(typeof REMINDER_PLACEHOLDERS)[number], string> = {
    "{cliente}": first,
    "{cosa}": vars.what.trim(),
    "{impianto}": vars.asset?.trim() || "il tuo impianto",
    "{data}": reminderDate(vars.dueAt),
    "{negozio}": vars.business.trim(),
  };
  // "il 8 ottobre" è sbagliato: davanti a 8 e 11 l'articolo diventa l'.
  const elided = /^(8|11)\b/.test(values["{data}"]) ? `l'${values["{data}"]}` : `il ${values["{data}"]}`;
  const text = (template?.trim() || DEFAULT_REMINDER_MESSAGE)
    .replace(/\bil \{data\}/g, elided)
    .replace(/\{(cliente|cosa|impianto|data|negozio)\}/g, (match) => values[match as keyof typeof values]);
  return text.replace(/^Ciao ,/, "Ciao,").replace(/[ \t]+\n/g, "\n").trim();
}

/** Calendar months, clamped to the last day: 31 January + 1 month is 28/29 February, not 3 March. */
export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/**
 * Next due date of a recurring maintenance once the job is done: the interval counts from the day
 * of the job, at the time of day the schedule already had.
 */
export function nextDueAt(current: Date, completedAt: Date, intervalMonths: number): Date {
  const next = addMonths(completedAt, intervalMonths);
  next.setUTCHours(current.getUTCHours(), current.getUTCMinutes(), 0, 0);
  return next;
}
