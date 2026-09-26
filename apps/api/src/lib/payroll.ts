import {
  buildPayroll,
  isUsable,
  ledgerCategoriesOf,
  moduleStatus,
  monthBounds,
  payrollCategory,
  payrollDescription,
  payrollMonthLabel,
  payrollMonthOf,
  payrollMonthsCovering,
  DEFAULT_WEEKLY_HOURS,
  type PayrollLine,
  type ResolvedCategory,
} from "@rapportini/shared";
import { categoryOfTenant } from "./catalog";
import { prisma } from "./prisma";

export interface PayrollViewLine extends PayrollLine {
  ledgerEntryId: string | null;
  paid: boolean;
}

export interface PayrollView {
  month: string;
  label: string;
  from: string;
  to: string;
  posted: boolean;
  ordinaryHours: number;
  overtimeHours: number;
  amount: number;
  lines: PayrollViewLine[];
}

function decimal(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function weeklyHours(value: unknown) {
  const parsed = decimal(value);
  return parsed != null && parsed > 0 ? parsed : DEFAULT_WEEKLY_HOURS;
}

function postingDate(from: Date, to: Date, now: Date) {
  if (now < from) return from;
  if (now >= to) return new Date(to.getTime() - 1000);
  return now;
}

async function accountingOpen(tenantId: string, category: ResolvedCategory) {
  const row = await prisma.tenantModule.findUnique({ where: { tenantId_moduleKey: { tenantId, moduleKey: "accounting" } } });
  const definition = category.modules.find((module) => module.key === "accounting");
  if (!definition) return false;
  return isUsable(
    moduleStatus(
      definition.free,
      row
        ? { key: "accounting", enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt, licenseExpiresAt: row.licenseExpiresAt }
        : undefined,
    ),
  );
}

export async function syncPayrollMonth(tenantId: string, month: string, options?: { replaceUserId?: string }): Promise<PayrollView> {
  const now = new Date();
  const { from, to } = monthBounds(month);
  const wideFrom = new Date(from.getTime() - 8 * 86_400_000);
  const wideTo = new Date(to.getTime() + 8 * 86_400_000);
  const [members, shifts, postings, category] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      include: { user: { select: { name: true } }, role: { select: { name: true } } },
    }),
    prisma.shift.findMany({
      where: { tenantId, startsAt: { lt: wideTo }, endsAt: { gt: wideFrom } },
      select: { userId: true, startsAt: true, endsAt: true, status: true },
    }),
    prisma.payrollPosting.findMany({ where: { tenantId, month }, include: { ledgerEntry: { select: { paid: true } } } }),
    categoryOfTenant(tenantId),
  ]);
  const postingByUser = new Map(postings.map((row) => [row.userId, row]));
  const people = members.map((member) => {
    const posting = postingByUser.get(member.userId);
    const useContract = !posting || options?.replaceUserId === member.userId;
    return {
      userId: member.userId,
      name: member.user.name,
      roleName: member.role.name,
      hourlyRate: decimal(useContract ? member.hourlyRate : posting.hourlyRate),
      overtimeRate: decimal(useContract ? member.overtimeRate : posting.overtimeRate),
      weeklyHours: weeklyHours(useContract ? member.weeklyHours : posting.weeklyHours),
    };
  });
  const report = buildPayroll({ month, now, people, shifts });
  const open = await accountingOpen(tenantId, category);
  const label = payrollMonthLabel(month);
  if (!open) {
    return { ...report, label, posted: false, lines: report.lines.map((line) => ({ ...line, ledgerEntryId: null, paid: false })) };
  }

  const categoryLabel = payrollCategory(ledgerCategoriesOf(category.presets.ledger).expense);
  const date = postingDate(from, to, now);
  const linked = new Map<string, { id: string; paid: boolean }>();

  await prisma.$transaction(async (tx) => {
    for (const line of report.lines) {
      const existing = postingByUser.get(line.userId);
      if (line.hourlyRate == null || line.amount <= 0) {
        if (existing) await tx.ledgerEntry.delete({ where: { id: existing.ledgerEntryId } });
        continue;
      }
      const overtimeRate = line.overtimeRate ?? line.hourlyRate;
      const description = payrollDescription({ ...line, hourlyRate: line.hourlyRate, overtimeRate });
      const rates = { hourlyRate: line.hourlyRate, overtimeRate, weeklyHours: line.weeklyHours };
      if (existing) {
        await tx.ledgerEntry.update({
          where: { id: existing.ledgerEntryId },
          data: { amount: line.amount, description, category: categoryLabel, date, kind: "EXPENSE", vatRate: 0 },
        });
        await tx.payrollPosting.update({ where: { id: existing.id }, data: rates });
        linked.set(line.userId, { id: existing.ledgerEntryId, paid: existing.ledgerEntry.paid });
      } else {
        const entry = await tx.ledgerEntry.create({
          data: { tenantId, kind: "EXPENSE", date, amount: line.amount, vatRate: 0, category: categoryLabel, description, paid: false },
        });
        await tx.payrollPosting.create({ data: { tenantId, userId: line.userId, month, ledgerEntryId: entry.id, ...rates } });
        linked.set(line.userId, { id: entry.id, paid: false });
      }
    }
  });

  return {
    ...report,
    label,
    posted: true,
    lines: report.lines.map((line) => {
      const row = linked.get(line.userId);
      return { ...line, ledgerEntryId: row?.id ?? null, paid: row?.paid ?? false };
    }),
  };
}

export async function refreshPayrollForShifts(tenantId: string, spans: { startsAt: Date; endsAt: Date }[]) {
  const months = new Set<string>();
  for (const span of spans) {
    if (Number.isNaN(span.startsAt.getTime()) || Number.isNaN(span.endsAt.getTime()) || span.endsAt <= span.startsAt) continue;
    months.add(payrollMonthOf(span.startsAt));
    months.add(payrollMonthOf(new Date(span.endsAt.getTime() - 1)));
  }
  for (const month of months) await syncPayrollMonth(tenantId, month);
}

export async function refreshPayrollRange(tenantId: string, from: Date, to: Date) {
  const [rated, posted] = await Promise.all([
    prisma.membership.count({ where: { tenantId, hourlyRate: { not: null } } }),
    prisma.payrollPosting.count({ where: { tenantId } }),
  ]);
  if (!rated && !posted) return;
  for (const month of payrollMonthsCovering(from, to)) await syncPayrollMonth(tenantId, month);
}
