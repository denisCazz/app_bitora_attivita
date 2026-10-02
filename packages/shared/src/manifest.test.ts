import { describe, expect, it } from "vitest";
import { categoryChain, planModules, resolveCategory, scoreModules, type CategoryNode, type ModuleDefRow, type NeedRow } from "./catalog";
import { buildManifest, buildNavigation, moduleStatus, renewsBilling } from "./manifest";
import { MODULE_KEYS } from "./modules";
import { PERMISSIONS } from "./permissions";
import { demoTestModule, stripeTrialEnd } from "./store";

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

  it("names word-bound modules after the trade's word, whatever the module row says", () => {
    const wellness = node({ id: "w", key: "wellness", terminology: { menu: "Listino", inventory: "Prodotti" }, modules: [row("menu", { label: "Menu" }), row("inventory"), row("shifts", { label: "Turni" })] });
    const labels = Object.fromEntries(resolveCategory([wellness], defs).modules.map((module) => [module.key, module.label]));
    expect(labels).toEqual({ menu: "Listino", inventory: "Prodotti", shifts: "Turni" });
    expect(resolveCategory([hospitality], defs).modules.find((module) => module.key === "menu")?.label).toBe("menu");
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

describe("renewsBilling", () => {
  const base = { key: "assets" as const, enabled: true, licensed: true, trialEndsAt: null };

  it("reads a card subscription as renewing until a cancellation date is set", () => {
    expect(renewsBilling({ ...base, billingSource: "STRIPE", licenseExpiresAt: null }, now)).toBe(true);
    expect(renewsBilling({ ...base, billingSource: "STRIPE", licenseExpiresAt: "2026-10-10T00:00:00Z" }, now)).toBe(false);
  });

  it("follows the store auto-renew flag", () => {
    const store = { ...base, billingSource: "APPLE" as const, licenseExpiresAt: "2026-10-10T00:00:00Z" };
    expect(renewsBilling({ ...store, autoRenews: true }, now)).toBe(true);
    expect(renewsBilling({ ...store, autoRenews: false }, now)).toBe(false);
  });

  it("has nothing to renew for demo, trials or expired licences", () => {
    expect(renewsBilling({ ...base, billingSource: "DEMO" }, now)).toBeNull();
    expect(renewsBilling({ ...base, licensed: false, trialEndsAt: "2026-10-01T00:00:00Z" }, now)).toBeNull();
    expect(renewsBilling({ ...base, billingSource: "GOOGLE", licenseExpiresAt: "2026-09-01T00:00:00Z" }, now)).toBeNull();
  });
});

describe("stripeTrialEnd", () => {
  it("defers the first card charge to the trial end only when Stripe accepts it", () => {
    expect(stripeTrialEnd("2026-10-01T00:00:00Z", now)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(stripeTrialEnd("2026-09-27T00:00:00Z", now)).toBeNull();
    expect(stripeTrialEnd(null, now)).toBeNull();
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

  it("renames a module and its tab when the shop changes the word", () => {
    const input = {
      user: { id: "u", name: "Marco", email: "m@x.it", platformAdmin: false },
      category: resolveCategory([fieldService, stoves], defs, needs),
      memberships: [],
      role: { id: "r", name: "Titolare", permissions: [...PERMISSIONS] },
      moduleStates: [{ key: "assets" as const, enabled: true, licensed: true, trialEndsAt: null }],
      customFields: [],
      now,
    };
    const renamed = buildManifest({ ...input, tenant: { id: "t", name: "Ferri", branding: {}, terminology: { assets: "Caldaie" } } });
    expect(renamed.modules.find((module) => module.key === "assets")?.label).toBe("Caldaie");
    expect(renamed.navigation.find((item) => item.key === "assets")?.label).toBe("Caldaie");
    const same = buildManifest({ ...input, tenant: { id: "t", name: "Ferri", branding: {}, terminology: { assets: "Stufe", workOrders: "Interventi" } } });
    expect(same.modules.find((module) => module.key === "assets")?.label).toBe("Stufe");
    expect(same.tenant.terminology.workOrders).toBe("Interventi");
  });

  it("hides modules the role cannot read but keeps Altro for profile and team", () => {
    const resolved = resolveCategory([fieldService], defs);
    expect(buildNavigation(resolved.modules, ["dashboard.view"]).map((item) => item.key)).toEqual(["dashboard", "more"]);
  });
});
