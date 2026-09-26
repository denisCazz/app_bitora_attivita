import type { ZodError } from "zod";

export interface SupplierDraft {
  name: string;
  vat: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  paymentTerms: string;
  notes: string;
}

export interface OrderLineDraft {
  key: string;
  description: string;
  quantity: string;
  price: string;
  ingredientId: string | null;
}

export function emptySupplier(): SupplierDraft {
  return { name: "", vat: "", contactName: "", phone: "", email: "", address: "", city: "", paymentTerms: "", notes: "" };
}

export function supplierDraft(source: {
  name: string;
  vat?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}): SupplierDraft {
  return {
    name: source.name,
    vat: source.vat ?? "",
    contactName: source.contactName ?? "",
    phone: source.phone ?? "",
    email: source.email ?? "",
    address: source.address ?? "",
    city: source.city ?? "",
    paymentTerms: source.paymentTerms ?? "",
    notes: source.notes ?? "",
  };
}

export function supplierIssue(error: ZodError): string {
  const field = error.issues[0]?.path[0];
  if (field === "name") return "Il nome deve avere almeno 2 lettere";
  if (field === "email") return "Email non valida";
  return "Controlla i campi";
}

export function emptyLine(): OrderLineDraft {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, description: "", quantity: "", price: "", ingredientId: null };
}

export function amount(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function orderTotal(lines: Array<{ quantity: string | number; unitPrice: string | number }>) {
  return lines.reduce((sum, line) => sum + amount(line.quantity) * amount(line.unitPrice), 0);
}

export function qty(value: string | number | null | undefined) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(amount(value));
}

export function orderTone(status: string): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (status === "RECEIVED") return "success";
  if (status === "SENT") return "accent";
  if (status === "DRAFT") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

export function dayLabel(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

/** "2026-09-26" → mezzogiorno UTC, così il giorno non slitta di fuso. */
export function isoDay(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("La consegna va scritta come AAAA-MM-GG");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(date.getTime())) throw new Error("Data di consegna non valida");
  return date.toISOString();
}

export function reorderQty(item: { quantity: number; minQuantity?: number | null }) {
  const min = amount(item.minQuantity);
  if (min > 0 && item.quantity < min) return Math.round((min - item.quantity) * 1000) / 1000;
  if (min > 0) return min;
  return 1;
}
