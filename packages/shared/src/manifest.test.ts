import { describe, expect, it } from "vitest";
import { categoryChain, planModules, resolveCategory, scoreModules, type CategoryNode, type ModuleDefRow, type NeedRow } from "./catalog";
import { buildManifest, buildNavigation, moduleStatus } from "./manifest";
import { MODULE_KEYS } from "./modules";
import { PERMISSIONS } from "./permissions";
import { demoTestModule } from "./store";

const now = new Date("2026-09-25T12:00:00Z");

const defs: ModuleDefRow[] = MODULE_KEYS.map((key, index) => ({
  key,
  label: key,
  description: "",
  pitch: "",
  details: "",
  features: [],
  icon: "grid-outline",
  priceCents: key === "dashboard" || key === "settings" ? 0 : 900,
  trialDays: 14,
  requires: key === "orders" || key === "inventory" ? ["menu"] : key === "floor" ? ["orders"] : [],
  sortOrder: index,
  active: true,
}));

function node(partial: Partial<CategoryNode> & Pick<CategoryNode, "id" | "key">): CategoryNode {
  return {
    parentId: null,
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
  recommended: null,
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
  presets: {
    customFields: [{ entity: "ASSET", key: "power", label: "Potenza", type: "NUMBER" }],
    scheduleKinds: [{ key: "GENERIC", label: "Manutenzione" }],
    sample: { customer: { name: "Mario Rossi" }, workOrder: "Primo intervento" },
  },
  modules: [
    row("dashboard", { free: true, tab: true, sortOrder: 0 }),
    row("work_orders", { free: true, tab: true, sortOrder: 1 }),
    row("assets", { tab: true, sortOrder: 2 }),
    row("spare_parts", { tab: true, sortOrder: 3 }),
    row("stock"),
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
  presets: {
    customFields: [{ entity: "ASSET", key: "fuel", label: "Combustibile", type: "SELECT", options: ["Pellet"] }],
    scheduleKinds: [{ key: "ANNUAL_CLEANING", label: "Pulizia annuale" }],
    sample: { workOrder: "Pulizia annuale" },
  },
  modules: [row("assets", { label: "Stufe" }), row("calendar", { included: false }), row("shifts", { recommended: false })],
});

const hospitality = node({
  id: "ho",
  key: "hospitality",
  modules: [row("dashboard", { free: true }), row("floor"), row("orders"), row("menu"), row("shifts", { recommended: false })],
});

const needs: NeedRow[] = [
  { id: "n1", key: "parts", categoryId: "fs", label: "Ricambi", description: "", icon: "cog", modules: ["spare_parts", "stock"], sortOrder: 0, active: true },
  { id: "n2", key: "tables", categoryId: "ho", label: "Tavoli", description: "", icon: "cog", modules: ["floor"], sortOrder: 0, active: true },
  { id: "n3", key: "team", categoryId: null, label: "Squadra", description: "", icon: "cog", modules: ["shifts"], sortOrder: 1, active: true },
  { id: "n4", key: "service", categoryId: null, label: "Servizio", description: "", icon: "cog", modules: ["floor"], sortOrder: 2, active: true },
];

describe("resolveCategory", () => {
  const resolved = resolveCategory(categoryChain([fieldService, stoves], "st"), defs, needs);

  it("offers only the modules of its branch and hides excluded ones", () => {
    const keys = resolved.modules.map((module) => module.key);
    expect(keys).toEqual(["dashboard", "work_orders", "assets", "spare_parts", "stock", "shifts", "settings"]);
    expect(resolved.modules.find((module) => module.key === "assets")?.label).toBe("Stufe");
    expect(resolved.modules.find((module) => module.key === "assets")?.tab).toBe(true);
    expect(resolved.modules.find((module) => module.key === "spare_parts")?.recommended).toBe(true);
    expect(resolved.modules.find((module) => module.key === "shifts")?.recommended).toBe(false);
  });

  it("keeps foreign modules out of other categories", () => {
    const keys = resolveCategory([hospitality], defs).modules.map((module) => module.key);
    expect(keys).toEqual(["dashboard", "floor", "orders", "menu", "shifts"]);
  });

  it("falls back to the whole catalog while a branch lists no module", () => {
    const blank = resolveCategory([node({ id: "b", key: "blank" })], defs);
    expect(blank.modules).toHaveLength(defs.length);
    expect(blank.modules.every((module) => !module.recommended)).toBe(true);
  });

  it("merges terminology, presets, vocab, accent and roles along the tree", () => {
    expect(resolved.terminology.assets).toBe("Stufe");
    expect(resolved.terminology.workOrders).toBe("Interventi");
    expect(resolved.presets.customFields?.map((field) => field.key)).toEqual(["power", "fuel"]);
    expect(resolved.presets.sample).toEqual({ customer: { name: "Mario Rossi" }, workOrder: "Pulizia annuale" });
    expect(resolved.vocab.scheduleKinds.map((item) => item.key)).toEqual(["GENERIC", "ANNUAL_CLEANING"]);
    expect(resolved.vocab.stations).toEqual([{ key: "MAIN", label: "Generale" }]);
    expect(resolved.accent).toBe("#E25B2A");
    expect(resolved.roles.map((role) => role.name)).toEqual(["Titolare"]);
    expect(resolved.path.map((item) => item.key)).toEqual(["field_service", "stoves"]);
  });

  it("keeps needs of the branch and global ones, category first, dropping those without modules here", () => {
    expect(resolved.needs.map((need) => need.key)).toEqual(["parts", "team"]);
  });

  it("lets a child activity replace only the ledger side it sets", () => {
    const parent = node({
      id: "p",
      key: "field_service",
      presets: { ledger: { income: ["Interventi"], expense: ["Materiali"] } },
    });
    const child = node({ id: "c", key: "mechanic", parentId: "p", presets: { ledger: { income: ["Manodopera"] } } });
    const mechanic = resolveCategory(categoryChain([parent, child], "c"), defs);
    expect(mechanic.vocab.ledger).toEqual({ income: ["Manodopera"], expense: ["Materiali"] });
    expect(mechanic.presets.ledger).toEqual({ income: ["Manodopera"], expense: ["Materiali"] });
  });

  it("drops modules disabled in the global catalog", () => {
    const off = defs.map((def) => (def.key === "spare_parts" ? { ...def, active: false } : def));
    expect(resolveCategory([fieldService], off).modules.some((module) => module.key === "spare_parts")).toBe(false);
  });
});

describe("scoreModules", () => {
  const resolved = resolveCategory(categoryChain([fieldService, stoves], "st"), defs, needs);

  it("boosts modules of chosen needs and pulls in what they require", () => {
    const bar = resolveCategory([hospitality], defs, needs);
    const score = scoreModules(bar.modules, bar.needs, ["tables"]);
    expect(score.get("floor")).toBe(4);
    expect(score.get("orders")).toBe(4);
    expect(score.get("menu")).toBe(4);
    expect(score.get("shifts")).toBe(0);
  });

  it("splits a plan into included, suggested and other modules", () => {
    const plan = planModules(resolved.modules, resolved.needs, ["parts"]);
    expect(plan.included.map((module) => module.key)).toEqual(["dashboard", "work_orders", "settings"]);
    expect(plan.suggested.map((module) => module.key).slice(0, 2)).toEqual(["spare_parts", "stock"]);
    expect(plan.others.map((module) => module.key)).toEqual(["shifts"]);
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

  it("locks store subscriptions once they expire", () => {
    const base = { key: "assets" as const, enabled: true, licensed: true, trialEndsAt: null, billingSource: "APPLE" as const };
    expect(moduleStatus(false, { ...base, licenseExpiresAt: "2026-10-01T00:00:00Z" }, now)).toBe("active");
    expect(moduleStatus(false, { ...base, licenseExpiresAt: "2026-09-01T00:00:00Z" }, now)).toBe("locked");
  });
});

describe("demoTestModule", () => {
  it("picks the cheapest paid module, first by sort order on ties", () => {
    const modules = [
      { key: "work_orders" as const, free: true, priceCents: 0, sortOrder: 0 },
      { key: "assets" as const, free: false, priceCents: 900, sortOrder: 3 },
      { key: "calendar" as const, free: false, priceCents: 500, sortOrder: 4 },
      { key: "customers" as const, free: false, priceCents: 500, sortOrder: 2 },
    ];
    expect(demoTestModule(modules)?.key).toBe("customers");
    expect(demoTestModule(modules.slice(0, 1))).toBeNull();
  });
});

describe("buildManifest", () => {
  it("shows only the free base plan in the navigation of a new shop", () => {
    const manifest = buildManifest({
      user: { id: "u", name: "Marco", email: "m@x.it", platformAdmin: false },
      tenant: { id: "t", name: "Ferri", branding: {}, needs: ["parts"] },
      category: resolveCategory([fieldService, stoves], defs, needs),
      memberships: [],
      role: { id: "r", name: "Titolare", permissions: [...PERMISSIONS] },
      moduleStates: [],
      customFields: [],
      now,
    });
    expect(manifest.navigation.map((item) => item.key)).toEqual(["dashboard", "work_orders", "more"]);
    expect(manifest.plan).toMatchObject({ paidModules: 0, monthlyCents: 0, seats: { included: 3, extra: 0, priceCents: 500 } });
    expect(manifest.modules.find((module) => module.key === "spare_parts")?.status).toBe("locked");
    expect(manifest.modules.find((module) => module.key === "stock")?.score).toBe(4);
    expect(manifest.tenant.branding.accent).toBe("#E25B2A");
    expect(manifest.tenant.category.path).toEqual(["field_service", "stoves"]);
  });

  it("hides modules the role cannot read", () => {
    const resolved = resolveCategory([fieldService], defs);
    expect(buildNavigation(resolved.modules, ["dashboard.view"]).map((item) => item.key)).toEqual(["dashboard"]);
  });
});
