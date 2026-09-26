import { describe, expect, it } from "vitest";
import { addPayrollMonths, buildPayroll, monthBounds, payrollCategory, payrollDescription, payrollMonthOf, payrollMonthsCovering } from "./payroll";

const month = "2026-09";
const after = new Date("2026-10-01T00:00:00+02:00");

function person(partial: Partial<Parameters<typeof buildPayroll>[0]["people"][number]> = {}) {
  return {
    userId: "ada",
    name: "Ada",
    roleName: "Sala",
    hourlyRate: 10,
    overtimeRate: 15,
    weeklyHours: 40,
    ...partial,
  };
}

function shift(startsAt: string, endsAt: string, status = "CONFIRMED", userId = "ada") {
  return { userId, startsAt, endsAt, status };
}

describe("month bounds", () => {
  it("uses Rome midnights, including the October clock change", () => {
    expect(monthBounds("2026-09").from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(monthBounds("2026-09").to.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(monthBounds("2026-10").to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(payrollMonthOf(new Date("2026-09-30T21:30:00Z"))).toBe("2026-09");
    expect(payrollMonthOf(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10");
  });

  it("steps and covers calendar months", () => {
    expect(addPayrollMonths("2026-12", 1)).toBe("2027-01");
    expect(payrollMonthsCovering(new Date("2026-09-20T00:00:00+02:00"), new Date("2026-10-02T00:00:00+02:00"))).toEqual(["2026-09", "2026-10"]);
  });
});

describe("buildPayroll", () => {
  it("pays a 40 hour week at the ordinary rate", () => {
    const shifts = ["07", "08", "09", "10", "11"].map((day) => shift(`2026-09-${day}T09:00:00+02:00`, `2026-09-${day}T17:00:00+02:00`));
    const report = buildPayroll({ month, now: after, people: [person()], shifts });
    expect(report.lines[0]).toMatchObject({ ordinaryHours: 40, overtimeHours: 0, amount: 400 });
    expect(report.amount).toBe(400);
  });

  it("pays hours past the weekly cap as overtime and resets the next Monday", () => {
    const first = ["07", "08", "09", "10", "11"].map((day) => shift(`2026-09-${day}T09:00:00+02:00`, `2026-09-${day}T18:00:00+02:00`));
    const second = [shift("2026-09-14T09:00:00+02:00", "2026-09-14T19:00:00+02:00")];
    const report = buildPayroll({ month, now: after, people: [person({ overtimeRate: 20 })], shifts: [...first, ...second] });
    expect(report.lines[0]).toMatchObject({ ordinaryHours: 50, overtimeHours: 5, amount: 600 });
  });

  it("lets hours before the month fill the weekly cap", () => {
    const report = buildPayroll({
      month,
      now: after,
      people: [person({ overtimeRate: 20 })],
      shifts: [
        shift("2026-08-31T00:00:00+02:00", "2026-09-01T16:00:00+02:00"),
        shift("2026-09-01T16:00:00+02:00", "2026-09-01T20:00:00+02:00"),
      ],
    });
    expect(report.lines[0]).toMatchObject({ ordinaryHours: 16, overtimeHours: 4, amount: 240 });
  });

  it("merges overlapping shifts and ignores cancelled or future ones", () => {
    const now = new Date("2026-09-07T18:00:00+02:00");
    const report = buildPayroll({
      month,
      now,
      people: [person()],
      shifts: [
        shift("2026-09-07T09:00:00+02:00", "2026-09-07T17:00:00+02:00", "PLANNED"),
        shift("2026-09-07T14:00:00+02:00", "2026-09-07T18:00:00+02:00", "CONFIRMED"),
        shift("2026-09-07T09:00:00+02:00", "2026-09-07T17:00:00+02:00", "CANCELLED"),
        shift("2026-09-08T09:00:00+02:00", "2026-09-08T17:00:00+02:00", "PLANNED"),
        shift("2026-09-09T09:00:00+02:00", "2026-09-09T17:00:00+02:00", "DONE"),
      ],
    });
    expect(report.lines[0]).toMatchObject({ ordinaryHours: 17, overtimeHours: 0, amount: 170 });
  });

  it("keeps the hours when the wage is missing", () => {
    const report = buildPayroll({
      month,
      now: after,
      people: [person({ hourlyRate: null, overtimeRate: null })],
      shifts: [shift("2026-09-07T09:00:00+02:00", "2026-09-07T17:00:00+02:00")],
    });
    expect(report.lines[0]).toMatchObject({ ordinaryHours: 8, overtimeHours: 0, amount: 0, hourlyRate: null });
  });
});

describe("payroll copy", () => {
  it("describes the wage and prefers the shop's personnel category", () => {
    expect(payrollDescription({ name: "Ada", ordinaryHours: 40, overtimeHours: 5, hourlyRate: 10, overtimeRate: 15 })).toBe(
      "Stipendio Ada · 40 h × 10,00 € + 5 h straord. × 15,00 €",
    );
    expect(payrollCategory(["Affitto", "Stipendi"])).toBe("Stipendi");
    expect(payrollCategory(["Affitto"])).toBe("Personale");
  });
});
