import { z } from "zod";

export const PAYMENT_STATUSES = ["DUE", "PARTIAL", "PAID", "CANCELLED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["STRIPE", "REVOLUT", "SATISPAY"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  DUE: "Da pagare",
  PARTIAL: "Parziale",
  PAID: "Pagato",
  CANCELLED: "Annullato",
};

export const PAYMENT_PROVIDER_LABEL: Record<PaymentProvider, string> = {
  STRIPE: "Stripe",
  REVOLUT: "Revolut",
  SATISPAY: "Satispay",
};

export const STRIPE_MIN_EUROS = 0.5;

export function roundEuros(value: number) {
  return Math.round(value * 100) / 100;
}

export function paymentStatusFor(amount: number, paidAmount: number): Exclude<PaymentStatus, "CANCELLED"> {
  const due = roundEuros(amount);
  const paid = roundEuros(paidAmount);
  if (paid <= 0) return "DUE";
  if (paid + 0.001 >= due) return "PAID";
  return "PARTIAL";
}

export interface PaymentAmounts {
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
}

/** Applies a status or amount change and keeps the three fields consistent. */
export function nextPaymentAmounts(current: PaymentAmounts, patch: Partial<PaymentAmounts>): PaymentAmounts | { error: string } {
  const amount = roundEuros(patch.amount ?? current.amount);
  if (!(amount > 0)) return { error: "Scrivi un importo" };

  if (patch.status === "CANCELLED") {
    const leftover = roundEuros(patch.paidAmount ?? current.paidAmount);
    if (leftover > 0) return { error: "Azzera l'incasso prima di annullare" };
    return { amount, paidAmount: 0, status: "CANCELLED" };
  }
  if (patch.status === undefined && current.status === "CANCELLED") {
    return { amount, paidAmount: 0, status: "CANCELLED" };
  }

  let paidAmount = roundEuros(patch.paidAmount ?? current.paidAmount);
  if (patch.status === "PAID") paidAmount = amount;
  if (patch.status === "DUE") paidAmount = 0;
  if (paidAmount < 0) return { error: "L'incasso non può essere negativo" };
  if (paidAmount > amount) {
    if (patch.paidAmount !== undefined && patch.status !== "PAID") return { error: "L'incasso supera l'importo" };
    paidAmount = amount;
  }

  const status = paymentStatusFor(amount, paidAmount);
  if (patch.status === "PARTIAL" && status !== "PARTIAL") return { error: "Per il parziale scrivi quanto è già stato incassato" };
  return { amount, paidAmount: status === "PAID" ? amount : paidAmount, status };
}

const HANDLE = /^[a-zA-Z0-9._-]{2,40}$/;

export function revolutPayUrl(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  if (/^https:\/\/(www\.)?revolut\.me\/[a-zA-Z0-9._-]{2,40}\/?$/i.test(raw)) return raw.replace(/\/$/, "");
  if (/^https:\/\/checkout\.revolut\.com\/.+/i.test(raw)) return raw;
  const handle = raw.replace(/^@/, "").replace(/^https?:\/\/(www\.)?revolut\.me\//i, "").split(/[/?#]/)[0] ?? "";
  if (!HANDLE.test(handle)) return null;
  return `https://revolut.me/${handle}`;
}

export function satispayPayUrl(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  if (/^https:\/\/([a-z0-9-]+\.)?satispay\.com\/.+/i.test(raw)) return raw;
  return null;
}

export function satispayPhone(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw || satispayPayUrl(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return raw;
}

export interface PaymentConfigInput {
  provider: PaymentProvider | null;
  revolut?: string | null;
  satispay?: string | null;
  stripeSecretKey?: string | null;
}

export function providerReady(config: PaymentConfigInput): boolean {
  if (config.provider === "STRIPE") return Boolean(config.stripeSecretKey?.trim());
  if (config.provider === "REVOLUT") return Boolean(revolutPayUrl(config.revolut));
  if (config.provider === "SATISPAY") return Boolean(satispayPayUrl(config.satispay) || satispayPhone(config.satispay));
  return false;
}

export function paymentConfigError(config: PaymentConfigInput): string | null {
  if (!config.provider) return null;
  if (config.provider === "STRIPE" && !config.stripeSecretKey?.trim()) return "Incolla la chiave Stripe del tuo conto";
  if (config.provider === "REVOLUT" && !revolutPayUrl(config.revolut)) return "Serve il nome Revolut o un link revolut.me";
  if (config.provider === "SATISPAY" && !satispayPayUrl(config.satispay) && !satispayPhone(config.satispay)) {
    return "Serve un link Satispay o un numero di telefono";
  }
  return null;
}

export function stripeKeyError(key: string): string | null {
  if (/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) return null;
  return "La chiave Stripe inizia con sk_ o rk_";
}

/** Italian mobiles become 39…; numbers already with a country code stay as dialed. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const raw = phone?.trim() ?? "";
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("00")) return digits.slice(2);
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("39") && digits.length >= 11) return digits;
  if (digits.startsWith("0")) return `39${digits.slice(1)}`;
  if (digits.length <= 10) return `39${digits}`;
  return digits;
}

export function paymentMessage(input: { customerName?: string | null; business: string; title: string; amountLabel: string; url: string }) {
  const first = input.customerName?.trim().split(/\s+/)[0];
  const hello = first ? `Ciao ${first},` : "Ciao,";
  return `${hello} puoi pagare ${input.amountLabel} per «${input.title}» qui: ${input.url}\n${input.business}`;
}

export function whatsappHref(phone: string | null | undefined, text: string): string | null {
  const number = whatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function mailtoHref(email: string | null | undefined, subject: string, body: string): string | null {
  const address = email?.trim();
  if (!address || !address.includes("@")) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const paymentWriteSchema = z.object({
  workOrderId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

export const paymentPatchSchema = z.object({
  amount: z.number().positive().max(1_000_000).optional(),
  paidAmount: z.number().min(0).max(1_000_000).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const paymentSentSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});

export const paymentConfigSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS).nullable(),
  revolut: z.string().trim().max(200).optional().nullable(),
  satispay: z.string().trim().max(200).optional().nullable(),
  stripeSecretKey: z.string().trim().max(200).optional(),
});
