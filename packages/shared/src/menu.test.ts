import { describe, expect, it } from "vitest";
import { classifyMenuImport, groupMenu, htmlToText, isPrivateAddress, publicHttpUrl, readMenuProposal } from "./menu";

const stations = [
  { key: "KITCHEN", label: "Cucina" },
  { key: "BAR", label: "Banco" },
];

describe("public page address", () => {
  it("rejects local and non-http addresses", () => {
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("192.168.0.4")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(() => publicHttpUrl("http://localhost/menu")).toThrow(/raggiungibile/);
    expect(() => publicHttpUrl("http://127.0.0.1/menu")).toThrow(/raggiungibile/);
    expect(() => publicHttpUrl("file:///tmp/menu.html")).toThrow(/http/);
    expect(() => publicHttpUrl("https://user:secret@example.com/menu")).toThrow(/password/);
    expect(publicHttpUrl("https://example.com/menu").hostname).toBe("example.com");
    expect(publicHttpUrl("https://facebook.com/menu").hostname).toBe("facebook.com");
  });
});

describe("groupMenu", () => {
  it("follows the meal order and keeps unavailable dishes last", () => {
    const groups = groupMenu([
      { name: "Acqua", category: "Bevande", available: true },
      { name: "Tiramisù", category: "Dolci", available: false },
      { name: "Panna cotta", category: "Dolci", available: true },
      { name: "Carbonara", category: "Primi", available: true },
      { name: "Bruschetta", category: "Antipasti", available: true },
    ]);
    expect(groups.map((group) => group.category)).toEqual(["Antipasti", "Primi", "Dolci", "Bevande"]);
    expect(groups[2]?.items.map((item) => item.name)).toEqual(["Panna cotta", "Tiramisù"]);
  });
});

describe("menu proposal", () => {
  it("keeps priced dishes and matches what is already on the menu", () => {
    const proposal = readMenuProposal(
      {
        summary: "Ho trovato due voci.",
        items: [
          { name: "Carbonara", category: "Primi", price: "14,00", station: "Cucina" },
          { name: "Spritz", category: "Cocktail", price: 7, station: "BAR", modifiers: [{ name: "Con prosecco", priceDelta: "1,50" }] },
          { name: "x", price: 3 },
          { name: "Senza prezzo", category: "Primi" },
        ],
      },
      stations,
    );
    expect(proposal.summary).toBe("Ho trovato due voci.");
    expect(proposal.items.map((item) => item.name)).toEqual(["Carbonara", "Spritz"]);
    expect(proposal.items[0]).toMatchObject({ price: 14, station: "KITCHEN" });
    expect(proposal.items[1]?.modifiers).toEqual([{ name: "Con prosecco", priceDelta: 1.5 }]);

    const diff = classifyMenuImport(
      [
        {
          id: "1",
          name: "Carbonara",
          category: "Primi",
          price: 12,
          station: "KITCHEN",
          available: true,
          modifiers: [],
        },
        {
          id: "2",
          name: "Cacio e pepe",
          category: "Primi",
          price: 13,
          station: "KITCHEN",
          available: true,
          modifiers: [],
        },
      ],
      proposal.items,
      stations,
    );
    expect(diff.items.find((item) => item.name === "Carbonara")?.change).toBe("update");
    expect(diff.items.find((item) => item.name === "Spritz")?.change).toBe("new");
    expect(diff.missing.map((item) => item.name)).toEqual(["Cacio e pepe"]);
  });

  it("strips scripts and tags from a page", () => {
    expect(htmlToText("<style>body{}</style><script>alert(1)</script><h1>Carbonara</h1> 14 &euro;")).toBe("Carbonara 14 €");
  });
});
