import { DEFAULT_SLOT_MINUTES, slotMinutes, type Manifest } from "@rapportini/shared";
import type { FastifyRequest } from "fastify";
import { tenantId } from "../../plugins/auth";
import { overlapsFor, type Slot } from "../agenda";
import { tenantDb } from "../prisma";
import { asksFor, type Action } from "./actions";

export type Preflight = { ok: true; note?: string } | { ok: false; error: string };

const MAX_FREE_SEARCH = 24;
const PAST_TOLERANCE_MS = 5 * 60_000;

function valueAt(body: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), body);
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function romeTime(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(date);
}

function romeDay(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" }).format(date);
}

function defaultDurationHint(manifest: Manifest, action: Action, body: Record<string, unknown>): string {
  if (action.slot !== "schedule") return `durata (di solito ${DEFAULT_SLOT_MINUTES} minuti)`;
  const kinds = manifest.tenant.vocab.scheduleKinds;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const label = kinds.find((item) => item.key === kind)?.label;
  return `durata (proponi ${slotMinutes(kinds, kind)} minuti, la predefinita${label ? ` per ${label}` : ""}, e mettila in durationMinutes se l'utente è d'accordo)`;
}

function describeSlot(item: Slot): string {
  return `${item.title} ${romeTime(new Date(item.start))}–${romeTime(new Date(item.end))}`;
}

interface Candidate {
  id?: string;
  start: Date;
  minutes: number;
  assetId: string | null;
  source: string;
}

async function scheduleCandidate(request: FastifyRequest, manifest: Manifest, action: Action, body: Record<string, unknown>, id?: string): Promise<Candidate | string | null> {
  const kinds = manifest.tenant.vocab.scheduleKinds;
  const existing = id ? await tenantDb(tenantId(request)).schedule.findFirst({ where: { id } }) : null;
  if (id && !existing) return "Appuntamento non trovato: cercalo di nuovo con get_agenda o list_schedules.";
  const touched = ["dueAt", "durationMinutes", "kind", "assetId"].some((key) => body[key] !== undefined);
  if (existing && !touched) return null;
  const kind = typeof body.kind === "string" ? body.kind : existing?.kind;
  if (kind && kinds.length && !kinds.some((item) => item.key === kind)) {
    return `Tipo "${kind}" non valido. Tipi del negozio: ${kinds.map((item) => `${item.key} (${item.label})`).join(", ")}.`;
  }
  const due = typeof body.dueAt === "string" ? body.dueAt : existing?.dueAt.toISOString();
  if (!due) return null;
  const explicit = typeof body.durationMinutes === "number" ? body.durationMinutes : body.durationMinutes === null ? null : existing?.durationMinutes ?? null;
  const minutes = explicit ?? slotMinutes(kinds, kind ?? "");
  const label = kinds.find((item) => item.key === kind)?.label;
  const source = explicit ? "indicata" : `predefinita${label ? ` per ${label}` : ""}`;
  const assetId = body.assetId !== undefined ? ((body.assetId as string | null) || null) : existing?.assetId ?? null;
  return { id: existing?.id, start: new Date(due), minutes, assetId, source: action.name === "create_schedule" || touched ? source : "attuale" };
}

async function workOrderCandidate(request: FastifyRequest, body: Record<string, unknown>, id?: string): Promise<Candidate | string | null> {
  const existing = id ? await tenantDb(tenantId(request)).workOrder.findFirst({ where: { id } }) : null;
  if (id && !existing) return "Intervento non trovato: cercalo di nuovo con list_work_orders.";
  if (body.status === "CANCELLED" || (body.scheduledAt === undefined && body.durationMinutes === undefined)) return null;
  const at = typeof body.scheduledAt === "string" ? body.scheduledAt : existing?.scheduledAt?.toISOString();
  if (!at) return null;
  const explicit = typeof body.durationMinutes === "number" ? body.durationMinutes : existing?.durationMinutes ?? null;
  const assetId = body.assetId !== undefined ? ((body.assetId as string | null) || null) : existing?.assetId ?? null;
  return { id: existing?.id, start: new Date(at), minutes: explicit ?? DEFAULT_SLOT_MINUTES, assetId, source: explicit ? "indicata" : "predefinita" };
}

async function firstFreeAfter(tenant: string, candidate: Candidate, overlaps: Slot[]): Promise<Date | null> {
  let start = candidate.start;
  let busy = overlaps;
  for (let step = 0; step < MAX_FREE_SEARCH && busy.length; step += 1) {
    start = new Date(Math.max(...busy.map((item) => new Date(item.end).getTime())));
    busy = await overlapsFor(tenant, { ...candidate, start });
  }
  return busy.length ? null : start;
}

async function checkSlot(request: FastifyRequest, candidate: Candidate, overlapOk: boolean, creating: boolean): Promise<Preflight> {
  if (Number.isNaN(candidate.start.getTime())) return { ok: false, error: "Data e ora non valide: usa ISO 8601 con fuso orario." };
  if (creating && candidate.start.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    return { ok: false, error: `L'orario ${romeDay(candidate.start)} alle ${romeTime(candidate.start)} è già passato: chiedi all'utente la data giusta.` };
  }
  const end = new Date(candidate.start.getTime() + candidate.minutes * 60_000);
  const slot = `${romeDay(candidate.start)} dalle ${romeTime(candidate.start)} alle ${romeTime(end)} (${candidate.minutes} minuti, durata ${candidate.source})`;
  const tenant = tenantId(request);
  const overlaps = await overlapsFor(tenant, candidate);
  if (!overlaps.length) return { ok: true, note: `Slot libero: ${slot}.` };
  if (overlapOk) return { ok: true, note: `Slot ${slot}, sovrapposto a: ${overlaps.map(describeSlot).join(", ")}.` };
  const free = await firstFreeAfter(tenant, candidate, overlaps);
  return {
    ok: false,
    error: [
      `Lo slot ${slot} si sovrappone a: ${overlaps.map(describeSlot).join(", ")}.`,
      free ? `Il primo orario libero dopo è alle ${romeTime(free)} di ${romeDay(free)}.` : "",
      "Non creare nulla: avvisa l'utente, proponi un orario libero e procedi con overlapOk true solo se vuole comunque questo orario.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** Deterministic checks run before a write is shown for confirmation or executed. */
export async function preflight(request: FastifyRequest, manifest: Manifest, action: Action, args: Record<string, unknown>): Promise<Preflight> {
  if (!action.write) return { ok: true };
  const body = args.body && typeof args.body === "object" ? (args.body as Record<string, unknown>) : {};
  if (action.body) {
    const parsed = action.body.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
      return { ok: false, error: `Dati non validi (${issues}). Chiedi all'utente i dati mancanti o corretti, non inventarli.` };
    }
  }
  const skipped = new Set(Array.isArray(args.skipped) ? args.skipped.filter((item): item is string => typeof item === "string") : []);
  const missing = asksFor(action, manifest).filter((ask) => !skipped.has(ask.field) && isEmpty(valueAt(body, ask.field)));
  if (missing.length) {
    const labels = missing.map((ask) => (ask.field === "durationMinutes" ? defaultDurationHint(manifest, action, body) : ask.label));
    return {
      ok: false,
      error: [
        `Non eseguita: mancano ${labels.join(", ")}.`,
        `Rileggi cosa ha scritto l'utente: i campi che ha già escluso (es. "nessuna postazione", "non lo so", "il resto no") mettili subito in skipped e richiama l'azione in questo stesso messaggio, senza chiedere di nuovo. Campi possibili: ${JSON.stringify(missing.map((ask) => ask.field))}.`,
        "Chiedi solo quelli di cui non ha mai parlato, tutti in una sola domanda breve, senza inventarli.",
      ].join(" "),
    };
  }
  if (!action.slot) return { ok: true };
  const id = typeof args.id === "string" ? args.id : undefined;
  const candidate = action.slot === "schedule" ? await scheduleCandidate(request, manifest, action, body, id) : await workOrderCandidate(request, body, id);
  if (typeof candidate === "string") return { ok: false, error: candidate };
  if (!candidate) return { ok: true };
  return checkSlot(request, candidate, args.overlapOk === true, !id);
}
