import { describe, expect, it } from "vitest";
import { barcodesMatch, matchesPartQuery, matchesScannedCode } from "./barcode";

describe("barcodesMatch", () => {
  it("matches the same code ignoring spaces, case and scanner noise", () => {
    expect(barcodesMatch("8001234567890", "8001234567890")).toBe(true);
    expect(barcodesMatch("800 1234 567890", "8001234567890\r")).toBe(true);
    expect(barcodesMatch("ABC-12", "]C0abc12")).toBe(true);
  });

  it("treats UPC-A and EAN-13 as the same product", () => {
    expect(barcodesMatch("036000291452", "0036000291452")).toBe(true);
  });

  it("reads an ITF-14 carton code as the product EAN-13", () => {
    expect(barcodesMatch("4006381333931", "14006381333938")).toBe(true);
  });

  it("does not match a different code", () => {
    expect(barcodesMatch("4006381333931", "8001234567890")).toBe(false);
    expect(barcodesMatch(null, "8001234567890")).toBe(false);
  });
});

describe("part lookup", () => {
  const part = { name: "Guarnizione sportello", sku: "GUA-963", barcode: "8001234567890" };

  it("finds a part by barcode, sku or name", () => {
    expect(matchesPartQuery(part, "8001234567890")).toBe(true);
    expect(matchesPartQuery(part, "gua-963")).toBe(true);
    expect(matchesPartQuery(part, "sportello")).toBe(true);
    expect(matchesPartQuery(part, "candela")).toBe(false);
  });

  it("accepts a scanned sku as well as the barcode", () => {
    expect(matchesScannedCode(part, "GUA-963")).toBe(true);
    expect(matchesScannedCode(part, "800 1234 567890")).toBe(true);
    expect(matchesScannedCode(part, "sportello")).toBe(false);
  });
});
