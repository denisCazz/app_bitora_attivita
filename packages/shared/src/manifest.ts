import { GENERIC_CATEGORY_KEY, needsFromModules, overlayVocab, type TenantActivityPresets } from "./activity";
import { scoreModules, type CatalogModule, type CategoryPresets, type NeedView, type ResolvedCategory, type Vocab } from "./catalog";
import type { ModuleKey } from "./modules";
import { hasPermission, type Permission } from "./permissions";
import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, seatMonthlyCents } from "./seats";
import { storeProductId, type BillingSource } from "./store";
import { mergeTerminology, type Terminology } from "./verticals";

export interface Branding {
  accent: string;
  logoUrl?: string | null;
}

export interface CustomFieldDTO {
  id: string;
  entity: "CUSTOMER" | "ASSET" | "WORK_ORDER" | "PRODUCT";
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "PHOTO";
  required: boolean;
  options: string[];
}

export interface NavItem {
  key: ModuleKey | "more";
  label: string;
  icon: string;
  route: string;
  tab: boolean;
}

export interface Manifest {
  user: { id: string; name: string; email: string; platformAdmin: boolean };
  tenant: {
    id: string;
    name: string;
    category: { id: string; key: string; label: string; path: string[]; image: string | null };
    branding: Branding;
    terminology: Terminology;
    assetTypes: string[];
    vocab: Vocab;
    needs: string[];
  };
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    roleName: string;
  }>;
  role: { id: string; name: string; permissions: string[]; owner?: boolean };
  /** The owner of the shop or a Bitora platform admin: the only ones who add or remove people. */
  managesPeople: boolean;
  modules: ManifestModule[];
  needs: NeedView[];
  plan: {
    paidModules: number;
    monthlyCents: number;
    seats: { included: number; extra: number; priceCents: number };
  };
  navigation: NavItem[];
  customFields: CustomFieldDTO[];
}

export type ModuleStatus = "active" | "trial" | "off" | "locked";

export interface ManifestModule {
  key: ModuleKey;
  status: ModuleStatus;
  free: boolean;
  recommended: boolean;
  score: number;
  requires: ModuleKey[];
  priceCents: number;
  trialDays: number;
  pitch: string;
  details: string;
  features: string[];
  trialEndsAt: string | null;
  billingSource: BillingSource | null;
  licenseExpiresAt: string | null;
  storeProductId: string;
  label: string;
  description: string;
  icon: string;
  route: string;
}

export interface ModuleState {
  key: ModuleKey;
  enabled: boolean;
  licensed: boolean;
  trialEndsAt: Date | string | null;
  billingSource?: BillingSource | null;
  licenseExpiresAt?: Date | string | null;
}

export function hasLicense(state: ModuleState | undefined, now = new Date()): boolean {
  if (!state?.licensed) return false;
  return !state.licenseExpiresAt || new Date(state.licenseExpiresAt) > now;
}

export function moduleStatus(free: boolean, state: ModuleState | undefined, now = new Date()): ModuleStatus {
  const trialEnds = state?.trialEndsAt ? new Date(state.trialEndsAt) : null;
  const inTrial = Boolean(trialEnds && trialEnds > now);
  const licensed = hasLicense(state, now);
  const unlocked = free || licensed || inTrial;
  if (!unlocked) return "locked";
  if (state && !state.enabled) return "off";
  if (!free && !licensed && inTrial) return "trial";
  return "active";
}

export function isUsable(status: ModuleStatus): boolean {
  return status === "active" || status === "trial";
}

export function buildNavigation(modules: readonly CatalogModule[], permissions: readonly string[]): NavItem[] {
  const visible = modules.filter((module) => hasPermission(permissions, module.permission));
  const tabs: NavItem[] = visible
    .filter((module) => module.tab)
    .slice(0, 4)
    .map((module) => ({ key: module.key, label: module.label, icon: module.icon, route: module.route, tab: true }));
  tabs.push({ key: "more", label: "Altro", icon: "ellipsis-horizontal", route: "/more", tab: true });
  return tabs;
}

export function buildManifest(input: {
  user: Manifest["user"];
  tenant: {
    id: string;
    name: string;
    branding: Partial<Branding>;
    terminology?: Partial<Terminology> | null;
    needs?: readonly string[];
    activity?: string | null;
    presets?: TenantActivityPresets | null;
  };
  category: ResolvedCategory;
  memberships: Manifest["memberships"];
  role: Manifest["role"];
  managesPeople?: boolean;
  moduleStates: readonly ModuleState[];
  customFields: CustomFieldDTO[];
  extraSeats?: number;
  now?: Date;
}): Manifest {
  const { category } = input;
  const needs = [...(input.tenant.needs ?? [])];
  const scoredNeeds = category.key === GENERIC_CATEGORY_KEY ? needsFromModules(needs) : category.needs;
  const scores = scoreModules(category.modules, scoredNeeds, needs);
  const terminology = mergeTerminology(category.terminology, input.tenant.terminology);
  const activity = input.tenant.activity?.trim();
  const path = category.path.map((node) => node.label);
  if (activity) path[path.length - 1] = activity;
  const modules: ManifestModule[] = category.modules.map((definition) => {
    const state = input.moduleStates.find((row) => row.key === definition.key);
    const score = scores.get(definition.key) ?? 0;
    return {
      key: definition.key,
      status: moduleStatus(definition.free, state, input.now),
      free: definition.free,
      recommended: score > 0,
      score,
      requires: definition.requires,
      priceCents: definition.priceCents,
      trialDays: definition.trialDays,
      pitch: definition.pitch,
      details: definition.details,
      features: definition.features,
      trialEndsAt: state?.trialEndsAt ? new Date(state.trialEndsAt).toISOString() : null,
      billingSource: state?.licensed ? (state.billingSource ?? null) : null,
      licenseExpiresAt: state?.licensed && state.licenseExpiresAt ? new Date(state.licenseExpiresAt).toISOString() : null,
      storeProductId: storeProductId(definition.key),
      label: definition.label,
      description: definition.description,
      icon: definition.icon,
      route: definition.route,
    };
  });
  const usable = category.modules.filter((definition) => isUsable(modules.find((module) => module.key === definition.key)!.status));
  const paid = modules.filter((module) => {
    const state = input.moduleStates.find((row) => row.key === module.key);
    return !module.free && hasLicense(state, input.now) && state?.billingSource !== "DEMO";
  });
  const extraSeats = Math.max(0, input.extraSeats ?? 0);
  const generic = category.key === GENERIC_CATEGORY_KEY;
  const navigation = buildNavigation(usable, input.role.permissions).map((item) => ({
    ...item,
    label: generic ? genericNavLabel(item.key, item.label, terminology) : item.label,
  }));
  return {
    user: input.user,
    tenant: {
      id: input.tenant.id,
      name: input.tenant.name,
      category: { id: category.id, key: category.key, label: activity || category.label, path, image: category.image },
      branding: { accent: input.tenant.branding.accent ?? category.accent, logoUrl: input.tenant.branding.logoUrl ?? null },
      terminology,
      assetTypes: input.tenant.presets?.assetTypes?.length ? input.tenant.presets.assetTypes : (category.presets.assetTypes ?? []),
      vocab: overlayVocab(category.vocab, input.tenant.presets),
      needs,
    },
    memberships: input.memberships,
    role: { ...input.role, owner: input.role.owner ?? false },
    managesPeople: input.managesPeople ?? false,
    modules,
    needs: category.needs,
    plan: {
      paidModules: paid.length,
      monthlyCents: paid.reduce((sum, module) => sum + module.priceCents, 0) + seatMonthlyCents(extraSeats),
      seats: { included: INCLUDED_SEATS, extra: extraSeats, priceCents: EXTRA_SEAT_CENTS },
    },
    navigation,
    customFields: input.customFields,
  };
}

function genericNavLabel(key: string, label: string, terminology: Terminology): string {
  if (key === "work_orders") return terminology.workOrders;
  if (key === "assets") return terminology.assets;
  if (key === "customers") return terminology.customers;
  if (key === "spare_parts") return terminology.spareParts;
  if (key === "stock") return terminology.warehouse;
  return label;
}

export function assertPermission(permissions: readonly string[], required: Permission): void {
  if (!hasPermission(permissions, required)) {
    const error = new Error("Permesso negato");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

export type { CategoryPresets };
