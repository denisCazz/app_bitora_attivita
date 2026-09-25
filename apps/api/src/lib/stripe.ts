import { EXTRA_SEAT_CENTS } from "@rapportini/shared";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { env } from "../env";
import { prisma } from "./prisma";

const EXTRA_SEAT_LOOKUP = "bitora_extra_seat_month";

const API_VERSION = "2026-07-29.dahlia";
const TAX_CODE = "txcd_10103000";

let client: Stripe | null = null;

export function stripeClient(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  client ??= new Stripe(env.stripeSecretKey, { apiVersion: API_VERSION });
  return client;
}

export function moduleProductId(key: string) {
  return `bitora_mod_${key}`;
}

export function moduleLookupKey(key: string) {
  return `bitora_${key}_month`;
}

export function integrationIdentifier(flow: "modules" | "seats") {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (const byte of randomBytes(8)) suffix += letters[byte % 26];
  return `bitora_${flow}_${suffix}`;
}

export function isStripeMissing(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing";
}


export async function ensureModulePrice(module: { key: string; label: string; description: string; priceCents: number }) {
  const stripe = stripeClient();
  if (!stripe || module.priceCents <= 0) return null;

  const productId = moduleProductId(module.key);
  const name = `Bitora · ${module.label}`;
  let product: Stripe.Product;
  try {
    product = await stripe.products.retrieve(productId);
  } catch (error) {
    if (!isStripeMissing(error)) throw error;
    product = await stripe.products.create({
      id: productId,
      name,
      description: module.description,
      tax_code: TAX_CODE,
      metadata: { moduleKey: module.key, product_type: "module" },
    });
  }
  if (product.name !== name || product.description !== module.description || !product.active) {
    product = await stripe.products.update(productId, { name, description: module.description, active: true });
  }

  const lookupKey = moduleLookupKey(module.key);
  const listed = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  let price = listed.data[0];
  if (!price || price.unit_amount !== module.priceCents || price.currency !== "eur") {
    price = await stripe.prices.create({
      product: productId,
      currency: "eur",
      unit_amount: module.priceCents,
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      transfer_lookup_key: true,
      metadata: { moduleKey: module.key },
    });
  }

  const currentDefault = typeof product.default_price === "string" ? product.default_price : product.default_price?.id;
  if (currentDefault !== price.id) {
    await stripe.products.update(productId, { default_price: price.id });
  }

  await prisma.moduleDef.update({
    where: { key: module.key },
    data: { stripeProductId: productId, stripePriceId: price.id },
  });
  return price.id;
}

export async function extraSeatPriceId() {
  const stripe = stripeClient();
  if (!stripe) return null;
  const listed = await stripe.prices.list({ lookup_keys: [EXTRA_SEAT_LOOKUP], active: true, limit: 1 });
  const current = listed.data[0];
  if (current && current.unit_amount === EXTRA_SEAT_CENTS && current.currency === "eur") return current.id;

  const productId = typeof current?.product === "string" ? current.product : current?.product?.id;
  const product =
    productId ??
    (
      await stripe.products.create({
        name: "Bitora · Utente extra",
        description: "Utente oltre i 3 inclusi nel piano base.",
        tax_code: TAX_CODE,
        metadata: { product_type: "extra_seat" },
      })
    ).id;
  const price = await stripe.prices.create({
    product,
    currency: "eur",
    unit_amount: EXTRA_SEAT_CENTS,
    recurring: { interval: "month" },
    lookup_key: EXTRA_SEAT_LOOKUP,
    transfer_lookup_key: true,
    metadata: { product_type: "extra_seat" },
  });
  await stripe.products.update(product, { default_price: price.id });
  return price.id;
}

export async function syncStripeCatalog() {
  if (!stripeClient()) return;
  await extraSeatPriceId();
  const modules = await prisma.moduleDef.findMany({ where: { active: true, priceCents: { gt: 0 } }, orderBy: { sortOrder: "asc" } });
  for (const module of modules) await ensureModulePrice(module);
}

export function stripeMessage(error: unknown) {
  return error instanceof Stripe.errors.StripeError ? error.message : "Pagamento non disponibile";
}
