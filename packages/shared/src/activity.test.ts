import { describe, expect, it } from "vitest";
import { needsFromModules, overlayVocab, parseActivitySetup, trialKeys } from "./activity";
import { resolveCategory, type CategoryNode, type ModuleDefRow } from "./catalog";
import { buildManifest } from "./manifest";
import { PERMISSIONS } from "./permissions";

describe("parseActivitySetup", () => {
  it("reads a fenced reply and drops modules that are not for sale", () => {
    const setup = parseActivitySetup(`\`\`\`json
      {
        "activity": "Lavanderia",
        "summary": "Ritiri, lavaggi e prodotti al banco.",
        "terminology": { "workOrder": "Ritiro", "workOrders": "Ritiri", "asset": "Macchina", "customer": "Cliente" },
        "assetTypes": ["Lavatrice", ""],
        "customFields": [
          { "entity": "CUSTOMER", "key": "Fabric", "label": "Tessuto", "type": "TEXT" },
          { "entity": "ASSET", "key": "ok", "label": "x", "type": "SELECT", "options": ["A"] }
        ],
        "checklists": [{ "name": "Apertura", "kind": "apertura", "items": [{ "id": "Cassa", "label": "Apri la cassa" }] }],
        "scheduleKinds": [{ "key": "ritiro", "label": "Ritiro", "tone": "accent" }],
        "stations": [{ "key": "banco", "label": "Banco" }],
        "modules": ["floor", "invented", "dashboard", { "key": "orders" }]
      }
    \`\`\``);
    expect(setup.activity).toBe("Lavanderia");
    expect(setup.terminology.workOrder).toBe("Ritiro");
    expect(setup.terminology.asset).toBe("Macchina");
    expect(setup.terminology.sparePart).toBe("Ricambio");
    expect(setup.assetTypes).toEqual(["Lavatrice"]);
    expect(setup.customFields).toEqual([{ entity: "CUSTOMER", key: "fabric", label: "Tessuto", type: "TEXT" }]);
    expect(setup.checklists[0]).toMatchObject({ name: "Apertura", kind: "APERTURA" });
    expect(setup.scheduleKinds[0]).toEqual({ key: "RITIRO", label: "Ritiro", tone: "accent" });
    expect(setup.stations).toEqual([{ key: "BANCO", label: "Banco" }]);
    expect(setup.modules).toEqual(["floor", "orders"]);
  });

  it("asks for a clearer description when the trade is missing", () => {
    expect(() => parseActivitySetup({ summary: "ok" })).toThrow(/mestiere/);
  });
});

describe("trialKeys", () => {
  const modules = [
    { key: "menu" as const, free: false, trialDays: 14, requires: [] },
    { key: "orders" as const, free: false, trialDays: 14, requires: ["menu" as const] },
    { key: "floor" as const, free: false, trialDays: 14, requires: ["orders" as const] },
    { key: "dashboard" as const, free: true, trialDays: 0, requires: [] },
  ];

  it("adds the modules a pick depends on", () => {
    expect(trialKeys(modules, ["floor"])).toEqual(["floor", "orders", "menu"]);
  });

  it("skips a pick whose dependencies do not fit the cap", () => {
    expect(trialKeys(modules, ["floor"], 2)).toEqual([]);
  });
});

describe("generic shop manifest", () => {
  const defs: ModuleDefRow[] = [
    { key: "dashboard", label: "Home", description: "", pitch: "", icon: "grid-outline", priceCents: 0, trialDays: 0, requires: [], sortOrder: 0, active: true },
    { key: "work_orders", label: "Interventi", description: "", pitch: "", icon: "construct-outline", priceCents: 900, trialDays: 14, requires: [], sortOrder: 1, active: true },
  ];
  const generic: CategoryNode = {
    id: "cat_generic",
    key: "generic",
    parentId: null,
    label: "Altra attività",
    description: "",
    icon: "storefront-outline",
    accent: "#6366F1",
    image: null,
    terminology: {},
    presets: {},
    sortOrder: 3,
    active: true,
    modules: [
      { moduleKey: "dashboard", included: true, recommended: true, free: true, tab: true, sortOrder: 0, label: null, description: null },
      { moduleKey: "work_orders", included: true, recommended: false, free: false, tab: true, sortOrder: 1, label: null, description: null },
    ],
    roles: [],
  };

  it("uses the trade name, the words and the places the assistant chose", () => {
    const manifest = buildManifest({
      user: { id: "u", name: "Ada", email: "a@x.it", platformAdmin: false },
      tenant: {
        id: "t",
        name: "Lava",
        branding: {},
        activity: "Lavanderia",
        needs: ["work_orders"],
        terminology: { workOrder: "Ritiro", workOrders: "Ritiri" },
        presets: { assetTypes: ["Lavatrice"], stations: [{ key: "BANCO", label: "Banco" }], scheduleKinds: [{ key: "RITIRO", label: "Ritiro", tone: "accent" }] },
      },
      category: resolveCategory([generic], defs),
      memberships: [],
      role: { id: "r", name: "Titolare", permissions: [...PERMISSIONS] },
      moduleStates: [{ key: "work_orders", enabled: true, licensed: false, trialEndsAt: "2026-10-01T00:00:00Z" }],
      customFields: [],
      now: new Date("2026-09-25T12:00:00Z"),
    });
    expect(manifest.tenant.category).toMatchObject({ label: "Lavanderia", path: ["Lavanderia"] });
    expect(manifest.tenant.terminology.workOrder).toBe("Ritiro");
    expect(manifest.tenant.assetTypes).toEqual(["Lavatrice"]);
    expect(manifest.tenant.vocab.stations).toEqual([{ key: "BANCO", label: "Banco" }]);
    expect(manifest.tenant.vocab.scheduleKinds.map((item) => item.key)).toEqual(["RITIRO", "GENERIC"]);
    expect(manifest.navigation.find((item) => item.key === "work_orders")?.label).toBe("Ritiri");
    expect(manifest.modules.find((module) => module.key === "work_orders")?.recommended).toBe(true);
    expect(needsFromModules(["floor"])[0]?.modules).toEqual(["floor"]);
    expect(overlayVocab(manifest.tenant.vocab).stations[0]?.key).toBe("BANCO");
  });
});
