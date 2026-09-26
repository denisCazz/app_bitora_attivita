import { describe, expect, it } from "vitest";
import { buildLedgerReport, ledgerCategoriesOf } from "./reports";

const now = new Date("2026-09-26T12:00:00Z");
const presets = {
  income: ["Interventi", "Ricambi"],
  expense: ["Materiali", "Carburante"],
};

describe("buildLedgerReport", () => {
  it("keeps the categories of the activity and folds the same name", () => {
    const report = buildLedgerReport({
      days: 7,
      now,
      presets,
      entries: [
        { id: "a", kind: "INCOME", date: "2026-09-26T09:00:00Z", amount: 120, vatRate: 22, category: "interventi", description: "Pulizia", paid: true },
        { id: "b", kind: "INCOME", date: "2026-09-25T09:00:00Z", amount: 40, vatRate: 0, category: "Consulenza", description: null, paid: false },
        { id: "c", kind: "EXPENSE", date: "2026-09-20T09:00:00Z", amount: 18.5, vatRate: 22, category: "Carburante", description: null, paid: true },
        { id: "old", kind: "INCOME", date: "2026-09-19T21:00:00Z", amount: 999, vatRate: 0, category: "Interventi", description: null, paid: true },
      ],
      open: { income: 40, expense: 0 },
    });

    expect(report.from).toBe("2026-09-20");
    expect(report.to).toBe("2026-09-26");
    expect(report.grain).toBe("day");
    expect(report.trend).toHaveLength(7);
    expect(report.income).toBe(160);
    expect(report.expense).toBe(18.5);
    expect(report.balance).toBe(141.5);
    expect(report.vatCollected).toBe(21.64);
    expect(report.toCollect).toBe(40);
    expect(report.categories.map((item) => item.category)).toEqual(["Interventi", "Ricambi", "Consulenza", "Materiali", "Carburante"]);
    expect(report.categories[0]).toMatchObject({ kind: "INCOME", amount: 120, count: 1 });
    expect(report.categories[2]).toMatchObject({ kind: "INCOME", amount: 40 });
    expect(report.entries.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(report.entries[0]?.category).toBe("Interventi");
  });

  it("puts a night that is already the next day in Rome on that day", () => {
    const report = buildLedgerReport({
      days: 7,
      now,
      presets,
      entries: [{ id: "night", kind: "EXPENSE", date: "2026-09-25T22:30:00Z", amount: 10, vatRate: 0, category: "Materiali", description: null, paid: true }],
    });
    const saturday = report.trend[report.trend.length - 1];
    expect(saturday?.label).toMatch(/26/);
    expect(saturday?.expense).toBe(10);
  });

  it("groups a quarter by week", () => {
    const report = buildLedgerReport({
      days: 90,
      now,
      presets,
      entries: [
        { id: "mon", kind: "INCOME", date: "2026-09-21T10:00:00Z", amount: 30, vatRate: 0, category: "Interventi", description: null, paid: true },
        { id: "sat", kind: "INCOME", date: "2026-09-26T10:00:00Z", amount: 20, vatRate: 0, category: "Interventi", description: null, paid: true },
      ],
    });
    expect(report.grain).toBe("week");
    const week = report.categories[0]?.points.find((point) => point.value > 0);
    expect(week?.value).toBe(50);
    expect(report.trend.filter((point) => point.income > 0)).toHaveLength(1);
  });
});

describe("ledgerCategoriesOf", () => {
  it("falls back when a side is missing", () => {
    expect(ledgerCategoriesOf({ income: ["Gelato"] })).toEqual({
      income: ["Gelato"],
      expense: ["Fornitori", "Affitto", "Personale", "Utenze"],
    });
  });
});
