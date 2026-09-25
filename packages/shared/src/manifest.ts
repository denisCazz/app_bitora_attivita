import type { CatalogModule, CategoryPresets, ResolvedCategory } from "./catalog";
import type { ModuleKey, Vertical } from "./modules";
import { hasPermission, type Permission } from "./permissions";
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
    vertical: Vertical;
    category: { id: string; key: string; label: string; path: string[]; image: string | null };
    branding: Branding;
    terminology: Terminology;
    assetTypes: string[];
  };
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    vertical: Vertical;
    roleName: string;
  }>;
  role: { id: string; name: string; permissions: string[] };
  modules: ManifestModule[];
  plan: { paidModules: number; monthlyCents: number };
  navigation: NavItem[];
  customFields: CustomFieldDTO[];
}

export type ModuleStatus = "active" | "trial" | "off" | "locked";

export interface ManifestModule {
  key: ModuleKey;
  status: ModuleStatus;
  free: boolean;
  priceCents: number;
  trialDays: number;
  pitch: string;
  trialEndsAt: string | null;
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
}

export function moduleStatus(free: boolean, state: ModuleState | undefined, now = new Date()): ModuleStatus {
  const trialEnds = state?.trialEndsAt ? new Date(state.trialEndsAt) : null;
  const inTrial = Boolean(trialEnds && trialEnds > now);
  const unlocked = free || Boolean(state?.licensed) || inTrial;
  if (!unlocked) return "locked";
  if (state && !state.enabled) return "off";
  if (!free && !state?.licensed && inTrial) return "trial";
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
  const overflow = visible.some((module) => !tabs.some((tab) => tab.key === module.key));
  if (overflow) tabs.push({ key: "more", label: "Altro", icon: "ellipsis-horizontal", route: "/more", tab: true });
  return tabs;
}

export function buildManifest(input: {
  user: Manifest["user"];
  tenant: { id: string; name: string; branding: Partial<Branding>; terminology?: Partial<Terminology> | null };
  category: ResolvedCategory;
  memberships: Manifest["memberships"];
  role: Manifest["role"];
  moduleStates: readonly ModuleState[];
  customFields: CustomFieldDTO[];
  now?: Date;
}): Manifest {
  const { category } = input;
  const modules: ManifestModule[] = category.modules.map((definition) => {
    const state = input.moduleStates.find((row) => row.key === definition.key);
    return {
      key: definition.key,
      status: moduleStatus(definition.free, state, input.now),
      free: definition.free,
      priceCents: definition.priceCents,
      trialDays: definition.trialDays,
      pitch: definition.pitch,
      trialEndsAt: state?.trialEndsAt ? new Date(state.trialEndsAt).toISOString() : null,
      label: definition.label,
      description: definition.description,
      icon: definition.icon,
      route: definition.route,
    };
  });
  const usable = category.modules.filter((definition) => isUsable(modules.find((module) => module.key === definition.key)!.status));
  const paid = modules.filter((module) => !module.free && input.moduleStates.find((row) => row.key === module.key)?.licensed);
  return {
    user: input.user,
    tenant: {
      id: input.tenant.id,
      name: input.tenant.name,
      vertical: category.family,
      category: { id: category.id, key: category.key, label: category.label, path: category.path.map((node) => node.label), image: category.image },
      branding: { accent: input.tenant.branding.accent ?? category.accent, logoUrl: input.tenant.branding.logoUrl ?? null },
      terminology: mergeTerminology(category.terminology, input.tenant.terminology),
      assetTypes: category.presets.assetTypes ?? [],
    },
    memberships: input.memberships,
    role: input.role,
    modules,
    plan: { paidModules: paid.length, monthlyCents: paid.reduce((sum, module) => sum + module.priceCents, 0) },
    navigation: buildNavigation(usable, input.role.permissions),
    customFields: input.customFields,
  };
}

export function assertPermission(permissions: readonly string[], required: Permission): void {
  if (!hasPermission(permissions, required)) {
    const error = new Error("Permesso negato");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

export type { CategoryPresets };
