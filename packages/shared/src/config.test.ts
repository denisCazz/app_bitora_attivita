import { describe, expect, it } from "vitest";
import { resolveFields, resolveNav, resolveTerms, resolveVocab, type FieldLayer, type NavLayer, type TermLayer, type VocabLayer } from "./config";

const chain = ["parent", "child"];

function field(partial: Partial<FieldLayer> & Pick<FieldLayer, "scopeKey" | "key">): FieldLayer {
  return {
    categoryId: null,
    tenantId: null,
    entityKey: "asset",
    label: null,
    type: null,
    builtIn: false,
    required: null,
    visible: null,
    sortOrder: null,
    section: null,
    showInList: null,
    refEntityKey: null,
    placeholder: null,
    help: null,
    options: [],
    ...partial,
  };
}

describe("resolveFields", () => {
  const rows: FieldLayer[] = [
    field({ scopeKey: "base", key: "name", label: "Nome", type: "TEXT", builtIn: true, required: true, sortOrder: 0 }),
    field({ scopeKey: "category:parent", categoryId: "parent", key: "fuel", label: "Combustibile", type: "SELECT", sortOrder: 8, options: [{ value: "Pellet", label: "Pellet", sortOrder: 0 }] }),
    field({ scopeKey: "category:child", categoryId: "child", key: "fuel", label: "Alimentazione", type: null, options: [] }),
    field({ scopeKey: "category:child", categoryId: "child", key: "name", label: "Nome stufa", type: null, visible: true }),
    field({ scopeKey: "tenant:shop", tenantId: "shop", key: "secret", label: "Nascosto", type: "TEXT", visible: false }),
  ];

  it("inherits type and options, and lets a child rename a field", () => {
    const fuel = resolveFields(rows, chain).find((item) => item.key === "fuel");
    expect(fuel).toMatchObject({ label: "Alimentazione", type: "SELECT", options: [{ value: "Pellet" }] });
  });

  it("renames a built-in field without changing its type", () => {
    const name = resolveFields(rows, chain).find((item) => item.key === "name");
    expect(name).toMatchObject({ label: "Nome stufa", type: "TEXT", builtIn: true, required: true });
  });

  it("drops a field the shop hides", () => {
    expect(resolveFields(rows, chain).some((item) => item.key === "secret")).toBe(false);
  });

  it("ignores rows from another branch", () => {
    const foreign = field({ scopeKey: "category:other", categoryId: "other", key: "other", label: "Altro", type: "TEXT" });
    expect(resolveFields([...rows, foreign], chain).some((item) => item.key === "other")).toBe(false);
  });
});

describe("resolveVocab", () => {
  const rows: VocabLayer[] = [
    { scopeKey: "base", categoryId: null, tenantId: null, listKey: "ledger_income", key: "incassi", label: "Incassi", tone: null, minutes: null, sortOrder: 0, visible: true },
    { scopeKey: "base", categoryId: null, tenantId: null, listKey: "ledger_expense", key: "affitto", label: "Affitto", tone: null, minutes: null, sortOrder: 0, visible: true },
    { scopeKey: "category:child", categoryId: "child", tenantId: null, listKey: "ledger_income", key: "mano", label: "Manodopera", tone: null, minutes: null, sortOrder: 0, visible: true },
    { scopeKey: "base", categoryId: null, tenantId: null, listKey: "schedule_kinds", key: "GENERIC", label: "Altro", tone: null, minutes: null, sortOrder: 9, visible: true },
    { scopeKey: "category:parent", categoryId: "parent", tenantId: null, listKey: "schedule_kinds", key: "GENERIC", label: "Manutenzione", tone: null, minutes: 60, sortOrder: 0, visible: true },
    { scopeKey: "category:child", categoryId: "child", tenantId: null, listKey: "schedule_kinds", key: "ANNUAL", label: "Pulizia", tone: "accent", minutes: null, sortOrder: 1, visible: true },
  ];
  const lists = [
    { key: "ledger_income", replace: true },
    { key: "ledger_expense", replace: true },
    { key: "schedule_kinds", replace: false },
  ];

  it("replaces only the ledger side a child defines", () => {
    const vocab = resolveVocab(lists, rows, chain);
    expect(vocab.get("ledger_income")?.map((item) => item.label)).toEqual(["Manodopera"]);
    expect(vocab.get("ledger_expense")?.map((item) => item.label)).toEqual(["Affitto"]);
  });

  it("merges schedule kinds by key along the branch", () => {
    const kinds = resolveVocab(lists, rows, chain).get("schedule_kinds") ?? [];
    expect(kinds.map((item) => item.key)).toEqual(["GENERIC", "ANNUAL"]);
    expect(kinds[0]).toMatchObject({ label: "Manutenzione", minutes: 60 });
  });
});

describe("resolveTerms", () => {
  it("overlays category and shop words on the defaults", () => {
    const defaults = { asset: "Impianto", assets: "Impianti" };
    const rows: TermLayer[] = [
      { scopeKey: "category:parent", categoryId: "parent", tenantId: null, key: "asset", value: "Apparecchio" },
      { scopeKey: "category:child", categoryId: "child", tenantId: null, key: "asset", value: "Stufa" },
      { scopeKey: "tenant:shop", categoryId: null, tenantId: "shop", key: "assets", value: "Stufe" },
    ];
    expect(resolveTerms(defaults, rows, chain)).toEqual({ asset: "Stufa", assets: "Stufe" });
  });
});

describe("resolveNav", () => {
  it("lets a category take a module off the tab bar", () => {
    const rows: NavLayer[] = [
      { scopeKey: "category:parent", categoryId: "parent", tenantId: null, placement: "TAB", key: "assets", parentKey: null, kind: "MODULE", moduleKey: "assets", route: null, label: "Impianti", icon: "hardware-chip-outline", subtitle: null, permission: null, sortOrder: 2, visible: true },
      { scopeKey: "category:child", categoryId: "child", tenantId: null, placement: "TAB", key: "assets", parentKey: null, kind: "MODULE", moduleKey: "assets", route: null, label: null, icon: null, subtitle: null, permission: null, sortOrder: null, visible: false },
      { scopeKey: "base", categoryId: null, tenantId: null, placement: "TAB", key: "more", parentKey: null, kind: "ROUTE", moduleKey: null, route: "/more", label: "Altro", icon: "ellipsis-horizontal", subtitle: null, permission: null, sortOrder: 100, visible: true },
    ];
    const nav = resolveNav(rows, chain);
    expect(nav.map((item) => item.key)).toEqual(["more"]);
  });
});
