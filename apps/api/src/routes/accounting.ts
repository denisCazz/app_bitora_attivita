import { buildLedgerReport, isLedgerDays, ledgerCategoriesOf, ledgerEntrySchema, type LedgerKind } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { blankToNull, HttpError, must, num, parseBody } from "../errors";
import { categoryOfTenant } from "../lib/catalog";
import { refreshPayrollRange } from "../lib/payroll";
import { tenantDb, type TenantDb } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { moduleGuard, permit } from "../plugins/guards";

const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  paid: z.enum(["true", "false"]).optional(),
});

const include = {
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  workOrder: { select: { id: true, title: true } },
} as const;

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

function rangeOf(query: z.infer<typeof rangeSchema>) {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (from >= to) throw new HttpError(400, "L'inizio deve precedere la fine");
  return { from, to };
}

async function checkLinks(db: TenantDb, body: { customerId?: string | null; supplierId?: string | null; workOrderId?: string | null }) {
  if (body.customerId) await must(db.customer.findFirst({ where: { id: body.customerId } }), "Cliente");
  if (body.supplierId) await must(db.supplier.findFirst({ where: { id: body.supplierId } }), "Fornitore");
  if (body.workOrderId) await must(db.workOrder.findFirst({ where: { id: body.workOrderId } }), "Intervento");
}

function vatOf(amount: number, vatRate: number) {
  return vatRate > 0 ? amount - amount / (1 + vatRate / 100) : 0;
}

const round = (value: number) => Math.round(value * 100) / 100;

export async function accountingRoutes(app: FastifyInstance) {
  const read = { preHandler: [app.requireTenant, permit("accounting.read"), moduleGuard("accounting")] };
  const write = { preHandler: [app.requireTenant, permit("accounting.write"), moduleGuard("accounting")] };

  app.get("/ledger", read, async (request) => {
    const query = parseBody(rangeSchema, request.query ?? {});
    const { from, to } = rangeOf(query);
    return tenantDb(tenantId(request)).ledgerEntry.findMany({
      where: { date: { gte: from, lt: to }, kind: query.kind, paid: query.paid === undefined ? undefined : query.paid === "true" },
      include,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
  });

  app.get("/ledger/report", read, async (request) => {
    const requested = Number((request.query as { days?: string }).days);
    const days = isLedgerDays(requested) ? requested : 30;
    const id = tenantId(request);
    const since = new Date(Date.now() - (days + 2) * 86_400_000);
    await refreshPayrollRange(id, since, new Date()).catch((error) => request.log.error(error));
    const db = tenantDb(id);
    const [category, rows, open] = await Promise.all([
      categoryOfTenant(id),
      db.ledgerEntry.findMany({
        where: { date: { gte: since } },
        select: { id: true, kind: true, date: true, amount: true, vatRate: true, category: true, description: true, paid: true },
      }),
      db.ledgerEntry.groupBy({ by: ["kind"], where: { paid: false }, _sum: { amount: true } }),
    ]);
    const openOf = (kind: LedgerKind) => num(open.find((row) => row.kind === kind)?._sum.amount);
    return buildLedgerReport({
      days,
      now: new Date(),
      presets: ledgerCategoriesOf(category.presets.ledger),
      entries: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        date: row.date,
        amount: num(row.amount),
        vatRate: num(row.vatRate),
        category: row.category,
        description: row.description,
        paid: row.paid,
      })),
      open: { income: openOf("INCOME"), expense: openOf("EXPENSE") },
    });
  });

  app.get("/ledger/summary", read, async (request) => {
    const query = parseBody(rangeSchema, request.query ?? {});
    const { from, to } = rangeOf(query);
    const db = tenantDb(tenantId(request));
    const [entries, open] = await Promise.all([
      db.ledgerEntry.findMany({ where: { date: { gte: from, lt: to } }, select: { kind: true, amount: true, vatRate: true, category: true } }),
      db.ledgerEntry.groupBy({ by: ["kind"], where: { paid: false }, _sum: { amount: true } }),
    ]);
    const totals: Record<LedgerKind, { amount: number; vat: number }> = { INCOME: { amount: 0, vat: 0 }, EXPENSE: { amount: 0, vat: 0 } };
    const categories = new Map<string, { kind: LedgerKind; category: string; amount: number }>();
    for (const entry of entries) {
      const amount = num(entry.amount);
      totals[entry.kind].amount += amount;
      totals[entry.kind].vat += vatOf(amount, num(entry.vatRate));
      const key = `${entry.kind}:${entry.category}`;
      const row = categories.get(key) ?? { kind: entry.kind, category: entry.category, amount: 0 };
      row.amount += amount;
      categories.set(key, row);
    }
    const openOf = (kind: LedgerKind) => round(num(open.find((row) => row.kind === kind)?._sum.amount));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      income: round(totals.INCOME.amount),
      expense: round(totals.EXPENSE.amount),
      balance: round(totals.INCOME.amount - totals.EXPENSE.amount),
      vatCollected: round(totals.INCOME.vat),
      vatPaid: round(totals.EXPENSE.vat),
      toCollect: openOf("INCOME"),
      toPay: openOf("EXPENSE"),
      categories: [...categories.values()].map((row) => ({ ...row, amount: round(row.amount) })).sort((a, b) => b.amount - a.amount),
    };
  });

  app.post("/ledger", write, async (request) => {
    const body = parseBody(ledgerEntrySchema, request.body);
    const id = tenantId(request);
    const db = tenantDb(id);
    await checkLinks(db, body);
    return db.ledgerEntry.create({
      data: {
        tenantId: id,
        kind: body.kind,
        date: new Date(body.date),
        amount: body.amount,
        vatRate: body.vatRate ?? 0,
        category: body.category,
        description: blankToNull(body.description),
        method: blankToNull(body.method),
        paid: body.paid ?? true,
        customerId: body.customerId || null,
        supplierId: body.supplierId || null,
        workOrderId: body.workOrderId || null,
      },
      include,
    });
  });

  app.patch("/ledger/:id", write, async (request) => {
    const body = parseBody(ledgerEntrySchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    await must(db.ledgerEntry.findFirst({ where: { id: idOf(request) } }), "Movimento");
    await checkLinks(db, body);
    return db.ledgerEntry.update({
      where: { id: idOf(request) },
      data: {
        kind: body.kind,
        date: body.date ? new Date(body.date) : undefined,
        amount: body.amount,
        vatRate: body.vatRate,
        category: body.category,
        description: body.description === undefined ? undefined : blankToNull(body.description),
        method: body.method === undefined ? undefined : blankToNull(body.method),
        paid: body.paid,
        customerId: body.customerId === undefined ? undefined : body.customerId || null,
        supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
        workOrderId: body.workOrderId === undefined ? undefined : body.workOrderId || null,
      },
      include,
    });
  });

  app.delete("/ledger/:id", write, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.ledgerEntry.findFirst({ where: { id: idOf(request) } }), "Movimento");
    await db.ledgerEntry.delete({ where: { id: idOf(request) } });
    return { ok: true };
  });
}
