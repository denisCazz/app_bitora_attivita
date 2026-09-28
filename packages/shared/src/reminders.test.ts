import { describe, expect, it } from "vitest";
import { addMonths, nextDueAt, readReminderSettings, reminderMessage } from "./reminders";

describe("reminderMessage", () => {
  const vars = { customerName: "Mario Rossi", what: "Pulizia annuale", asset: "Stufa Edilkamin", dueAt: new Date("2026-10-12T08:00:00Z"), business: "Ferri Stufe" };

  it("fills the default text with the first name and an Italian date", () => {
    expect(reminderMessage(null, vars)).toBe(
      "Ciao Mario, ti ricordiamo che per Stufa Edilkamin scade «Pulizia annuale» il 12 ottobre. Rispondi a questo messaggio per fissare l'appuntamento.\nFerri Stufe",
    );
  });

  it("elides the article before 8 and 11", () => {
    expect(reminderMessage(null, { ...vars, dueAt: new Date("2026-10-08T08:00:00Z") })).toContain("scade «Pulizia annuale» l'8 ottobre.");
    expect(reminderMessage(null, { ...vars, dueAt: new Date("2026-11-11T08:00:00Z") })).toContain("l'11 novembre");
  });

  it("uses the shop's own template", () => {
    expect(reminderMessage("{negozio}: {cosa} il {data}", vars)).toBe("Ferri Stufe: Pulizia annuale il 12 ottobre");
  });

  it("reads well without a customer name or asset", () => {
    expect(reminderMessage(null, { ...vars, customerName: null, asset: null })).toMatch(/^Ciao, ti ricordiamo che per il tuo impianto scade/);
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths(new Date("2027-01-31T09:00:00Z"), 1).toISOString()).toBe("2027-02-28T09:00:00.000Z");
    expect(addMonths(new Date("2028-01-31T09:00:00Z"), 1).toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });

  it("crosses the year", () => {
    expect(addMonths(new Date("2026-11-15T09:00:00Z"), 12).toISOString()).toBe("2027-11-15T09:00:00.000Z");
  });
});

describe("nextDueAt", () => {
  it("counts from the job and keeps the schedule's time of day", () => {
    const next = nextDueAt(new Date("2026-10-01T07:30:00Z"), new Date("2026-10-20T15:42:00Z"), 12);
    expect(next.toISOString()).toBe("2027-10-20T07:30:00.000Z");
  });
});

describe("readReminderSettings", () => {
  it("falls back to safe defaults", () => {
    expect(readReminderSettings(undefined)).toEqual({ enabled: false, daysBefore: 30, autoEmail: true, message: null });
    expect(readReminderSettings({ enabled: true, daysBefore: 999, autoEmail: false, message: "  " })).toEqual({
      enabled: true,
      daysBefore: 30,
      autoEmail: false,
      message: null,
    });
  });
});
