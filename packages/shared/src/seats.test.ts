import { describe, expect, it } from "vitest";
import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, seatCapacity, seatLimitMessage, seatMonthlyCents } from "./seats";

describe("seats", () => {
  it("includes three users and prices each extra user at 5 euro a month", () => {
    expect(INCLUDED_SEATS).toBe(3);
    expect(EXTRA_SEAT_CENTS).toBe(500);
    expect(seatCapacity(0)).toBe(3);
    expect(seatCapacity(2)).toBe(5);
    expect(seatMonthlyCents(0)).toBe(0);
    expect(seatMonthlyCents(2)).toBe(1000);
    expect(seatLimitMessage()).toContain("3");
    expect(seatLimitMessage()).toContain("5€");
  });
});
