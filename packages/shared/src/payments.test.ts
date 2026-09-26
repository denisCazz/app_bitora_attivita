import { describe, expect, it } from "vitest";
import {
  mailtoHref,
  nextPaymentAmounts,
  paymentConfigError,
  paymentMessage,
  providerReady,
  revolutPayUrl,
  satispayPayUrl,
  satispayPhone,
  whatsappHref,
  whatsappNumber,
} from "./payments";

describe("nextPaymentAmounts", () => {
  const due = { amount: 100, paidAmount: 0, status: "DUE" as const };

  it("marks the whole amount paid", () => {
    expect(nextPaymentAmounts(due, { status: "PAID" })).toEqual({ amount: 100, paidAmount: 100, status: "PAID" });
  });

  it("keeps a partial collection", () => {
    expect(nextPaymentAmounts(due, { status: "PARTIAL", paidAmount: 40 })).toEqual({ amount: 100, paidAmount: 40, status: "PARTIAL" });
  });

  it("refuses to cancel money already collected", () => {
    expect(nextPaymentAmounts({ amount: 100, paidAmount: 40, status: "PARTIAL" }, { status: "CANCELLED" })).toEqual({
      error: "Azzera l'incasso prima di annullare",
    });
  });

  it("becomes partial when the total grows past what was already paid", () => {
    expect(nextPaymentAmounts({ amount: 80, paidAmount: 80, status: "PAID" }, { amount: 120 })).toEqual({
      amount: 120,
      paidAmount: 80,
      status: "PARTIAL",
    });
  });
});

describe("provider links", () => {
  it("builds a Revolut.me link from a handle", () => {
    expect(revolutPayUrl("@oficina")).toBe("https://revolut.me/oficina");
    expect(revolutPayUrl("https://checkout.revolut.com/payment-link/abc")).toBe("https://checkout.revolut.com/payment-link/abc");
    expect(revolutPayUrl("no spaces")).toBeNull();
  });

  it("accepts a Satispay link or a phone", () => {
    expect(satispayPayUrl("https://www.satispay.com/pay/shop")).toBe("https://www.satispay.com/pay/shop");
    expect(satispayPhone("333 123 4567")).toBe("333 123 4567");
    expect(satispayPhone("https://www.satispay.com/pay/shop")).toBeNull();
  });

  it("knows when a method can actually be used", () => {
    expect(providerReady({ provider: "REVOLUT", revolut: "oficina" })).toBe(true);
    expect(providerReady({ provider: "STRIPE" })).toBe(false);
    expect(paymentConfigError({ provider: "SATISPAY", satispay: "ciao" })).toBe("Serve un link Satispay o un numero di telefono");
  });
});

describe("customer channels", () => {
  it("turns an Italian mobile into a WhatsApp link", () => {
    expect(whatsappNumber("333 111 2233")).toBe("393331112233");
    const href = whatsappHref("3331112233", "Paga qui");
    expect(href).toBe("https://wa.me/393331112233?text=Paga%20qui");
  });

  it("writes the message the customer receives", () => {
    expect(
      paymentMessage({ customerName: "Mario Rossi", business: "Officina", title: "Tagliando", amountLabel: "80,00 €", url: "https://pay.example/abc" }),
    ).toContain("Ciao Mario,");
    expect(mailtoHref("mario@example.com", "Pagamento", "ciao")).toMatch(/^mailto:mario@example.com/);
    expect(mailtoHref("", "Pagamento", "ciao")).toBeNull();
  });
});
