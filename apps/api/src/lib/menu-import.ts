import { classifyMenuImport, menuKey, readMenuProposal, stationOf, type CurrentMenuItem } from "@rapportini/shared";
import { HttpError } from "../errors";
import { categoryOfTenant } from "./catalog";
import { completeJson } from "./assistant/openai";
import { prisma } from "./prisma";
import { readPublicPage } from "./public-page";

interface Station {
  key: string;
  label: string;
}

export async function previewMenuImport(tenantId: string, url: string) {
  const stations = await stationsOf(tenantId);
  const [page, current] = await Promise.all([readPublicPage(url), loadMenu(tenantId)]);
  let raw: unknown;
  try {
    raw = await completeJson(prompt(stations, current), page);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Non sono riuscito a leggere il menu. Riprova.");
  }
  const proposal = readMenuProposal(raw, stations);
  if (!proposal.items.length) throw new HttpError(422, "Non ho trovato voci di menu su questa pagina");
  const diff = classifyMenuImport(current, proposal.items, stations);
  return { url, summary: proposal.summary || `Ho trovato ${diff.items.length} voci.`, ...diff };
}

export async function applyMenuImport(tenantId: string, input: { url: string; hideMissing?: boolean; items: unknown }) {
  const stations = await stationsOf(tenantId);
  const proposal = readMenuProposal({ items: input.items }, stations);
  if (!proposal.items.length) throw new HttpError(400, "Nessuna voce da salvare");

  await prisma.$transaction(async (tx) => {
    const existingItems = await tx.menuItem.findMany({ where: { tenantId }, include: { modifiers: { include: { modifier: true } } } });
    const existingModifiers = await tx.modifier.findMany({ where: { tenantId } });
    const modifierIds = new Map(existingModifiers.map((row) => [menuKey(row.name), row.id]));
    const seen = new Set<string>();

    async function modifierId(name: string, priceDelta: number) {
      const key = menuKey(name);
      const found = modifierIds.get(key);
      if (found) {
        if (priceDelta !== 0) await tx.modifier.update({ where: { id: found }, data: { priceDelta } });
        return found;
      }
      const created = await tx.modifier.create({ data: { tenantId, name: name.trim(), priceDelta } });
      modifierIds.set(key, created.id);
      return created.id;
    }

    for (const item of proposal.items) {
      const key = menuKey(item.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const station = stationOf(item.station, stations);
      const current = existingItems.find((row) => menuKey(row.name) === key);
      const links = item.modifiers.length
        ? [...new Set(await Promise.all(item.modifiers.map((modifier) => modifierId(modifier.name, modifier.priceDelta))))]
        : null;
      if (current) {
        await tx.menuItem.update({
          where: { id: current.id },
          data: { category: item.category, station, price: item.price, available: item.available },
        });
        if (links) {
          await tx.menuItemModifier.deleteMany({ where: { menuItemId: current.id } });
          if (links.length) {
            await tx.menuItemModifier.createMany({ data: links.map((id) => ({ tenantId, menuItemId: current.id, modifierId: id })) });
          }
        }
      } else {
        const created = await tx.menuItem.create({
          data: { tenantId, name: item.name, category: item.category, station, price: item.price, available: item.available, customFields: {} },
        });
        if (links?.length) {
          await tx.menuItemModifier.createMany({ data: links.map((id) => ({ tenantId, menuItemId: created.id, modifierId: id })) });
        }
      }
    }

    if (input.hideMissing) {
      const hidden = existingItems.filter((row) => !seen.has(menuKey(row.name))).map((row) => row.id);
      if (hidden.length) await tx.menuItem.updateMany({ where: { tenantId, id: { in: hidden } }, data: { available: false } });
    }

    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = settingsOf(tenant?.settings);
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: { ...settings, menuSourceUrl: input.url } } });
  });

  return { ok: true };
}

export function menuSourceUrl(settings: unknown): string | null {
  const url = settingsOf(settings).menuSourceUrl;
  return typeof url === "string" && url.trim() ? url : null;
}

function settingsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

async function stationsOf(tenantId: string): Promise<Station[]> {
  const stations = (await categoryOfTenant(tenantId)).vocab.stations;
  if (!stations.length) throw new HttpError(400, "Nessun reparto configurato");
  return stations;
}

async function loadMenu(tenantId: string): Promise<CurrentMenuItem[]> {
  const rows = await prisma.menuItem.findMany({
    where: { tenantId },
    include: { modifiers: { include: { modifier: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    station: row.station,
    available: row.available,
    modifiers: row.modifiers.map((link) => ({ name: link.modifier.name, priceDelta: Number(link.modifier.priceDelta) })),
  }));
}

function prompt(stations: Station[], current: CurrentMenuItem[]): string {
  const catalog = current
    .slice(0, 120)
    .map((item) => `- ${item.name} | ${item.category} | ${item.price} | ${item.station}`)
    .join("\n");
  return [
    "Leggi il testo di una pagina di un locale e ricava solo il menu venduto.",
    "Rispondi solo con un oggetto JSON:",
    '{"summary":"una frase in italiano","items":[{"name":"","category":"","price":0,"station":"KEY","available":true,"modifiers":[{"name":"","priceDelta":0}]}]}',
    "",
    "Reparti, usa la key:",
    ...stations.map((station) => `- ${station.key}: ${station.label}`),
    "",
    catalog ? `Menu già presente. Se è la stessa voce, riusa esattamente il nome:\n${catalog}` : "Il menu è ancora vuoto.",
    "",
    "Regole:",
    "- Solo voci scritte nel testo, con un prezzo in euro. Non inventare piatti, prezzi o categorie.",
    "- price e priceDelta sono numeri, senza simbolo. La virgola è decimale.",
    "- category è breve e in italiano: Antipasti, Primi, Secondi, Contorni, Pizze, Dolci, Bevande, Vini, Cocktail, Caffè. Raggruppa le voci simili.",
    "- station è una key dell'elenco. Bevande, vini e caffè vanno al banco se c'è; i piatti in cucina.",
    "- modifiers solo se il testo indica un'aggiunta o una variante con o senza sovrapprezzo. Se non ci sono, ometti l'array.",
    "- available false solo se il testo dice esaurito o non disponibile.",
    "- summary dice quante voci hai trovato, senza elencarle tutte.",
  ].join("\n");
}
