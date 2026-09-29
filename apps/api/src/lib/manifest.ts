import {
  buildManifest,
  categoryChain,
  resolveFields,
  resolveNav,
  resolveTerms,
  resolveVocab,
  type CustomFieldDTO,
  type ModuleKey,
  type TenantActivityPresets,
} from "@rapportini/shared";
import { HttpError } from "../errors";
import { catalogNodes, configRows, resolvedCategory, tenantConfigRows } from "./catalog";
import { platformInt } from "./platform";
import { prisma } from "./prisma";
import { foundingMembership, isPlatformAdmin } from "./team";

const LEGACY_ENTITY: Record<string, CustomFieldDTO["entity"]> = {
  customer: "CUSTOMER",
  asset: "ASSET",
  work_order: "WORK_ORDER",
  menu_item: "PRODUCT",
};

const LEGACY_TYPE = new Set<CustomFieldDTO["type"]>(["TEXT", "NUMBER", "DATE", "SELECT", "PHOTO"]);

export async function manifestFor(userId: string, tenantId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { role: true, tenant: true },
  });
  if (!user || !membership || membership.status !== "ACTIVE") throw new HttpError(404, "Negozio non trovato");

  const [memberships, modules, category, founding, storePurchases, rows, overlay, nodes, entities, permissions, includedSeats, extraSeatCents] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { tenant: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenantModule.findMany({ where: { tenantId } }),
    resolvedCategory(membership.tenant.categoryId),
    foundingMembership(tenantId),
    prisma.storePurchase.findMany({
      where: { tenantId, active: true },
      select: { moduleKey: true, platform: true, autoRenewing: true },
      orderBy: { expiresAt: { sort: "desc", nulls: "first" } },
    }),
    configRows(),
    tenantConfigRows(tenantId),
    catalogNodes(),
    prisma.entityDef.findMany({ orderBy: { label: "asc" } }),
    prisma.permissionDef.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }),
    platformInt("included_seats"),
    platformInt("extra_seat_cents"),
  ]);
  const platformAdmin = isPlatformAdmin(user);
  const chain = categoryChain(nodes, membership.tenant.categoryId).map((node) => node.id);
  const fields = resolveFields([...rows.fields, ...overlay.fields], chain);
  const terms = resolveTerms(rows.termDefaults, [...rows.terms, ...overlay.terms], chain);
  const vocab = resolveVocab(rows.vocabLists, [...rows.vocab, ...overlay.vocab], chain);
  const menus = resolveNav([...rows.nav, ...overlay.nav], chain);
  const assetTypes = (vocab.get("asset_types") ?? []).map((item) => item.label);
  const presets: TenantActivityPresets = {
    assetTypes,
    scheduleKinds: (vocab.get("schedule_kinds") ?? []).map((item) => ({
      key: item.key,
      label: item.label,
      ...(item.tone === "accent" || item.tone === "warning" || item.tone === "success" ? { tone: item.tone } : {}),
      ...(item.minutes ? { minutes: item.minutes } : {}),
    })),
    stations: (vocab.get("stations") ?? []).map((item) => ({ key: item.key, label: item.label })),
  };
  const customFields: CustomFieldDTO[] = fields.flatMap((field) => {
    const entity = LEGACY_ENTITY[field.entityKey];
    if (field.builtIn || !entity || !LEGACY_TYPE.has(field.type as CustomFieldDTO["type"])) return [];
    return [{
      id: `${field.entityKey}:${field.key}`,
      entity,
      key: field.key,
      label: field.label,
      type: field.type as CustomFieldDTO["type"],
      required: field.required,
      options: field.options.map((option) => option.value),
    }];
  });
  const byPlacement = {
    TAB: menus.filter((item) => item.placement === "TAB"),
    MORE: menus.filter((item) => item.placement === "MORE"),
    SETTINGS: menus.filter((item) => item.placement === "SETTINGS"),
    HOME_ACTIONS: menus.filter((item) => item.placement === "HOME_ACTIONS"),
  };

  return buildManifest({
    user: { id: user.id, name: user.name, email: user.email, platformAdmin },
    tenant: {
      id: membership.tenant.id,
      name: membership.tenant.name,
      branding: { accent: membership.tenant.accent ?? undefined, logoUrl: membership.tenant.logoUrl },
      terminology: terms,
      needs: membership.tenant.needs,
      activity: membership.tenant.activity,
      presets,
    },
    category,
    memberships: memberships.map((item) => ({
      tenantId: item.tenantId,
      tenantName: item.tenant.name,
      roleName: item.role.name,
    })),
    role: { id: membership.role.id, name: membership.role.name, permissions: membership.role.permissions, owner: founding?.id === membership.id },
    managesPeople: founding?.id === membership.id || platformAdmin,
    moduleStates: modules.map((module) => ({
      key: module.moduleKey as ModuleKey,
      enabled: module.enabled,
      licensed: module.licensed,
      trialEndsAt: module.trialEndsAt,
      billingSource: module.billingSource,
      licenseExpiresAt: module.licenseExpiresAt,
      autoRenews: storePurchases.find((purchase) => purchase.moduleKey === module.moduleKey && purchase.platform === module.billingSource)?.autoRenewing ?? null,
    })),
    customFields,
    entities: entities.map((entity) => ({
      key: entity.key,
      label: entity.label,
      labelPlural: entity.labelPlural,
      icon: entity.icon,
      native: entity.native,
      titleFieldKey: entity.titleFieldKey,
      fields: fields.filter((field) => field.entityKey === entity.key),
    })),
    menus: byPlacement,
    permissions: permissions.map((row) => ({ key: row.key, moduleKey: row.moduleKey, section: row.section, label: row.label, description: row.description })),
    extraSeats: membership.tenant.extraSeats,
    includedSeats,
    extraSeatCents,
  });
}
