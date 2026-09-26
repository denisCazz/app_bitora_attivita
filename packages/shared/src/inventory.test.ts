import { describe, expect, it } from "vitest";
import { daysLeft, isConsumption, reorderQuantity, stockLevel } from "./inventory";

describe("stockLevel", () => {
  it("flags empty stock even without a minimum", () => {
    expect(stockLevel(0, null)).toBe("out");
    expect(stockLevel(-1, 5)).toBe("out");
  });

  it("is low at or under the minimum", () => {
    expect(stockLevel(5, 5)).toBe("low");
    expect(stockLevel(2.5, 5)).toBe("low");
    expect(stockLevel(5.001, 5)).toBe("ok");
  });

  it("ignores a zero minimum", () => {
    expect(stockLevel(1, 0)).toBe("ok");
  });
});

describe("reorderQuantity", () => {
  it("refills up to twice the minimum", () => {
    expect(reorderQuantity(2, 5)).toBe(8);
    expect(reorderQuantity(0, 5)).toBe(10);
    expect(reorderQuantity(-3, 5)).toBe(10);
  });

  it("orders nothing above the minimum", () => {
    expect(reorderQuantity(6, 5)).toBe(0);
  });

  it("rounds fractional needs up", () => {
    expect(reorderQuantity(0.4, 1.5)).toBe(3);
  });

  it("suggests one unit for empty items without a minimum", () => {
    expect(reorderQuantity(0, null)).toBe(1);
    expect(reorderQuantity(3, null)).toBe(0);
  });
});

describe("daysLeft", () => {
  it("projects from the last 30 days of usage", () => {
    expect(daysLeft(10, 30)).toBe(10);
    expect(daysLeft(10, 60)).toBe(5);
  });

  it("has no estimate without usage", () => {
    expect(daysLeft(10, 0)).toBeNull();
    expect(daysLeft(0, 0)).toBe(0);
  });
});

describe("isConsumption", () => {
  it("skips transfers and loads", () => {
    expect(isConsumption(-2, "Consumo")).toBe(true);
    expect(isConsumption(-2, "Trasferimento verso Bar")).toBe(false);
    expect(isConsumption(3, "Carico")).toBe(false);
  });
});
