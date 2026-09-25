import { describe, expect, it } from "vitest";
import { categoryChain, resolveCategory, type CategoryNode, type ModuleDefRow } from "./catalog";
import { buildManifest, buildNavigation, moduleStatus } from "./manifest";
import { MODULE_KEYS } from "./modules";
import { PERMISSIONS } from "./permissions";

const now = new Date("2026-09-25T12:00:00Z");

const defs: ModuleDefRow[] = MODULE_KEYS.map((key, index) => ({
  key,
  label: key,
  description: "",
  pitch: "",
  icon: "grid-outline",
  priceCents: key === "dashboard" || key === "settings" ? 0 : 900,
  trialDays: 14,
  sortOrder: index,
  active: true,
}));

function node(partial: Partial<CategoryNode> & Pick<CategoryNode, "id" | "key">): CategoryNode {
  return {
    parentId: null,
    family: "FIELD_SERVICE",
    label: partial.key,
    description: "",
    icon: "construct-outline",
    accent: null,
    image: null,
    terminology: {},
    presets: {},
    sortOrder: 0,
    active: true,
    modules: [],
    roles: [],
    ...partial,
  };
}

const row = (moduleKey: string, extra: Partial<CategoryNode["modules"][number]> = {}) => ({
  moduleKey,
  included: true,
  free: null,
  tab: null,
  sortOrder: null,
  label: null,
  description: null,
  ...extra,
});

const fieldService = node({
  id: "fs",
  key: "field_service",
  accent: "#2F6FED",
  terminology: { asset: "Impianto", assets: "Impianti" },
  presets: { customFields: [{ entity: "ASSET", key: "power", label: "Potenza", type: "NUMBER" }] },
  modules: [
    row("dashboard", { free: true, tab: true, sortOrder: 0 }),
    row("work_orders", { free: true, tab: true, sortOrder: 1 }),
    row("assets", { tab: true, sortOrder: 2 }),
    row("spare_parts", { tab: true, sortOrder: 3 }),
    row("calendar"),
    row("settings", { free: true, sortOrder: 99 }),
  ],
  roles: [{ name: "Titolare", owner: true, permissions: [...PERMISSIONS], sortOrder: 0 }],
});

const stoves = node({
  id: "st",
  key: "stoves",
  parentId: "fs",
  accent: "#E25B2A",
  terminology: { asset: "Stufa", assets: "Stufe" },
  presets: { customFields: [{ entity: "ASSET", key: "fuel", label: "Combustibile", type: "SELECT", options: ["Pellet"] }] },
  modules: [row("assets", { label: "Stufe" }), row("calendar", { included: false })],
});

describe("resolveCategory", () => {
  const resolved = resolveCategory(categoryChain([fieldService, stoves], "st"), defs);

  it("inherits modules from the parent and applies subcategory overrides", () => {
    expect(resolved.modules.map((module) => module.key)).toEqual(["dashboard", "work_orders", "assets", "spare_parts", "settings"]);
    expect(resolved.modules.find((module) => module.key === "assets")?.label).toBe("Stufe");
    expect(resolved.modules.find((module) => module.key === "assets")?.tab).toBe(true);
  });

  it("merges terminology, presets, accent and roles along the tree", () => {
    expect(resolved.terminology.assets).toBe("Stufe");
    expect(resolved.terminology.workOrders).toBe("Interventi");
    expect(resolved.presets.customFields?.map((field) => field.key)).toEqual(["power", "fuel"]);
    expect(resolved.accent).toBe("#E25B2A");
    expect(resolved.roles.map((role) => role.name)).toEqual(["Titolare"]);
    expect(resolved.path.map((item) => item.key)).toEqual(["field_service", "stoves"]);
  });

  it("drops modules disabled in the global catalog", () => {
    const off = defs.map((def) => (def.key === "spare_parts" ? { ...def, active: false } : def));
    expect(resolveCategory([fieldService], off).modules.some((module) => module.key === "spare_parts")).toBe(false);
  });
});

describe("moduleStatus", () => {
  it("unlocks free modules without a licence", () => {
    expect(moduleStatus(true, undefined, now)).toBe("active");
  });

  it("locks paid modules until licensed or in trial", () => {
    const base = { key: "assets" as const, enabled: true, licensed: false };
    expect(moduleStatus(false, { ...base, trialEndsAt: null }, now)).toBe("locked");
    expect(moduleStatus(false, { ...base, trialEndsAt: "2026-10-01T00:00:00Z" }, now)).toBe("trial");
    expect(moduleStatus(false, { ...base, trialEndsAt: "2026-09-01T00:00:00Z" }, now)).toBe("locked");
    expect(moduleStatus(false, { ...base, licensed: true, trialEndsAt: null }, now)).toBe("active");
  });
});

describe("buildManifest", () => {
  it("shows only the free base plan in the navigation of a new shop", () => {
    const manifest = buildManifest({
      user: { id: "u", name: "Marco", email: "m@x.it", platformAdmin: false },
      tenant: { id: "t", name: "Ferri", branding: {} },
      category: resolveCategory([fieldService, stoves], defs),
      memberships: [],
      role: { id: "r", name: "Titolare", permissions: [...PERMISSIONS] },
      moduleStates: [],
      customFields: [],
      now,
    });
    expect(manifest.navigation.map((item) => item.key)).toEqual(["dashboard", "work_orders", "more"]);
    expect(manifest.modules.find((module) => module.key === "spare_parts")?.status).toBe("locked");
    expect(manifest.tenant.branding.accent).toBe("#E25B2A");
    expect(manifest.tenant.category.path).toEqual(["field_service", "stoves"]);
  });

  it("hides modules the role cannot read", () => {
    const resolved = resolveCategory([fieldService], defs);
    expect(buildNavigation(resolved.modules, ["dashboard.view"]).map((item) => item.key)).toEqual(["dashboard"]);
  });
});
