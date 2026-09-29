import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, LEGAL_VERSION, DEFAULT_ACCENT } from "@rapportini/shared";
import { prisma } from "./prisma";

const TTL_MS = 15_000;

const FALLBACKS: Record<string, { intValue?: number; textValue?: string }> = {
  included_seats: { intValue: INCLUDED_SEATS },
  extra_seat_cents: { intValue: EXTRA_SEAT_CENTS },
  default_accent: { textValue: DEFAULT_ACCENT },
  legal_version: { textValue: LEGAL_VERSION },
};

let cache: { at: number; rows: Map<string, { intValue: number | null; textValue: string | null }> } | null = null;

async function rows() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const loaded = await prisma.platformSetting.findMany();
  cache = {
    at: Date.now(),
    rows: new Map(loaded.map((row) => [row.key, { intValue: row.intValue, textValue: row.textValue }])),
  };
  return cache.rows;
}

export function invalidatePlatform() {
  cache = null;
}

export async function platformInt(key: string, fallback = FALLBACKS[key]?.intValue ?? 0) {
  const row = (await rows()).get(key);
  return row?.intValue ?? fallback;
}

export async function platformText(key: string, fallback = FALLBACKS[key]?.textValue ?? "") {
  const row = (await rows()).get(key);
  return row?.textValue?.trim() ? row.textValue : fallback;
}
