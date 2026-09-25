import { DEFAULT_SLOT_MINUTES, slotMinutes } from "@rapportini/shared";
import { categoryOfTenant } from "./catalog";
import { tenantDb } from "./prisma";

const MAX_SLOT_MS = 720 * 60_000;

export interface Slot {
  type: "schedule" | "work_order";
  id: string;
  title: string;
  kind?: string;
  start: string;
  end: string;
  minutes: number;
  assetId: string | null;
  asset?: string | null;
  customer?: string | null;
}

function slot(input: Omit<Slot, "start" | "end" | "minutes"> & { start: Date; minutes: number }): Slot {
  return { ...input, start: input.start.toISOString(), end: new Date(input.start.getTime() + input.minutes * 60_000).toISOString(), minutes: input.minutes };
}

export async function agenda(tenantId: string, from: Date, to: Date, include: { schedules: boolean; workOrders: boolean }): Promise<Slot[]> {
  const db = tenantDb(tenantId);
  const since = new Date(from.getTime() - MAX_SLOT_MS);
  const [kinds, schedules, workOrders] = await Promise.all([
    include.schedules ? categoryOfTenant(tenantId).then((category) => category.vocab.scheduleKinds) : Promise.resolve([]),
    include.schedules ? db.schedule.findMany({ where: { dueAt: { gte: since, lt: to } }, include: { asset: { select: { name: true } } }, orderBy: { dueAt: "asc" } }) : Promise.resolve([]),
    include.workOrders
      ? db.workOrder.findMany({
          where: { scheduledAt: { gte: since, lt: to }, status: { notIn: ["CANCELLED"] } },
          include: { asset: { select: { name: true } }, customer: { select: { name: true } } },
          orderBy: { scheduledAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const slots = [
    ...schedules.map((row) =>
      slot({ type: "schedule", id: row.id, title: row.title, kind: row.kind, start: row.dueAt, minutes: row.durationMinutes ?? slotMinutes(kinds, row.kind), assetId: row.assetId, asset: row.asset?.name ?? null }),
    ),
    ...workOrders.map((row) =>
      slot({
        type: "work_order",
        id: row.id,
        title: row.title,
        start: row.scheduledAt!,
        minutes: row.durationMinutes ?? DEFAULT_SLOT_MINUTES,
        assetId: row.assetId,
        asset: row.asset?.name ?? null,
        customer: row.customer?.name ?? null,
      }),
    ),
  ];
  return slots.filter((item) => new Date(item.end) > from).sort((a, b) => a.start.localeCompare(b.start));
}

export async function overlapsFor(tenantId: string, candidate: { id?: string; assetId?: string | null; start: Date; minutes: number }): Promise<Slot[]> {
  const end = new Date(candidate.start.getTime() + candidate.minutes * 60_000);
  const busy = await agenda(tenantId, candidate.start, end, { schedules: true, workOrders: true });
  return busy.filter((item) => item.id !== candidate.id && (!candidate.assetId || item.assetId === candidate.assetId) && new Date(item.start) < end);
}
