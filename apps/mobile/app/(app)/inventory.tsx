import { INVENTORY_UNITS, daysLeft, ingredientSchema, matchesPartQuery, matchesScannedCode, reorderQuantity, type InventoryMove } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Share, TextInput, View } from "react-native";
import { Badge, Button, Card, EmptyState, Fab, Input, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { BarcodeScan } from "../../src/components/BarcodeScan";
import { Chip } from "../../src/components/Chip";
import { CircleButton, SectionLabel } from "../../src/components/Hero";
import { ItemRow, MoveTabs, Stat, StockHero, formatQty, levelOf, parseQty, useLevelColor, type InventoryItem, type InventoryMovement } from "../../src/components/Inventory";
import { QueryState } from "../../src/components/States";
import { euro, when } from "../../src/format";
import { can, useCanUse, useManifest } from "../../src/session";

interface Location {
  id: string;
  name: string;
  kind: string;
}

interface Supplier {
  id: string;
  name: string;
}

type Filter = "all" | "reorder" | "out";

interface Draft {
  id?: string;
  name: string;
  unit: string;
  customUnit: boolean;
  category: string;
  minQuantity: string;
  unitCost: string;
  supplierId: string | null;
  sku: string;
  barcode: string;
  initial: string;
}

type Panel = { kind: "item"; id: string } | { kind: "edit"; draft: Draft } | { kind: "reorder" } | { kind: "count" };

const LEVEL_RANK = { out: 0, low: 1, ok: 2 } as const;
const UNITS: readonly string[] = INVENTORY_UNITS;
const NO_CATEGORY = "Senza categoria";

function inputQty(value: number) {
  return String(value).replace(".", ",");
}

function optionalNumber(text: string, label: string) {
  if (!text.trim()) return null;
  const value = parseQty(text);
  if (Number.isNaN(value) || value < 0) throw new Error(`${label}: scrivi un numero`);
  return value;
}

function FilterTabs({ value, counts, onChange }: { value: Filter; counts: Record<Filter, number>; onChange: (value: Filter) => void }) {
  const theme = useTheme();
  const options: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Tutti" },
    { key: "reorder", label: "Da riordinare" },
    { key: "out", label: "Esauriti" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressy
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: active ? theme.colors.ink : "transparent" }}
          >
            <Text variant="label" style={{ color: active ? theme.colors.paper : theme.colors.inkSoft }}>
              {option.label}
            </Text>
            {counts[option.key] ? (
              <Text variant="caption" style={{ fontWeight: "800", color: active ? theme.colors.paper : theme.colors.inkSoft, opacity: 0.7 }}>
                {counts[option.key]}
              </Text>
            ) : null}
          </Pressy>
        );
      })}
    </View>
  );
}

export default function InventoryScreen() {
  const theme = useTheme();
  const colorOf = useLevelColor();
  const manifest = useManifest();
  const title = manifest.data?.modules.find((module) => module.key === "inventory")?.label ?? "Scorte";
  const writable = can(manifest.data, "inventory.write");
  const suppliersOn = useCanUse("suppliers") && can(manifest.data, "suppliers.read");
  const canOrder = suppliersOn && can(manifest.data, "suppliers.write");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [scanFor, setScanFor] = useState<"find" | "barcode" | null>(null);

  const [move, setMove] = useState<InventoryMove>("OUT");
  const [moveQty, setMoveQty] = useState("");
  const [moveCost, setMoveCost] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moveLocation, setMoveLocation] = useState<string | null>(null);
  const [moveDone, setMoveDone] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [orderQty, setOrderQty] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});

  const query = useQuery({ queryKey: ["ingredients"], queryFn: () => http.get<InventoryItem[]>("/ingredients") });
  const locationsQuery = useQuery({ queryKey: ["inventory-locations"], queryFn: () => http.get<Location[]>("/inventory/locations") });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => http.get<Supplier[]>("/suppliers"), enabled: suppliersOn });

  const items = useMemo(() => query.data ?? [], [query.data]);
  const locations = locationsQuery.data ?? [];
  const defaultLocation = locations.find((location) => location.kind === "POINT") ?? locations[0];
  const moveAt = locations.find((location) => location.id === moveLocation) ?? defaultLocation;
  const selected = panel?.kind === "item" ? items.find((item) => item.id === panel.id) : undefined;
  const history = useQuery({
    queryKey: ["inventory-moves", selected?.id],
    queryFn: () => http.get<InventoryMovement[]>(`/ingredients/${selected!.id}/movements`),
    enabled: Boolean(selected),
  });

  const low = items.filter((item) => levelOf(item) === "low").length;
  const out = items.filter((item) => levelOf(item) === "out").length;
  const value = items.reduce((sum, item) => sum + Math.max(item.quantity, 0) * (item.unitCost ?? 0), 0);
  const categories = [...new Set(items.map((item) => item.category?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "it"));
  const toOrder = items.filter((item) => levelOf(item) !== "ok");

  const visible = items
    .filter((item) => {
      const level = levelOf(item);
      if (filter === "reorder" && level === "ok") return false;
      if (filter === "out" && level !== "out") return false;
      if (category && (item.category?.trim() || NO_CATEGORY) !== category) return false;
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return (
        matchesPartQuery({ name: item.name, sku: item.sku ?? "", barcode: item.barcode }, search) ||
        (item.category ?? "").toLowerCase().includes(needle) ||
        (item.supplier?.name ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => LEVEL_RANK[levelOf(a)] - LEVEL_RANK[levelOf(b)] || a.name.localeCompare(b.name, "it"));

  const grouped = new Map<string, InventoryItem[]>();
  for (const item of visible) {
    const key = item.category?.trim() || NO_CATEGORY;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const groups = [...grouped.entries()]
    .sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, "it")))
    .map(([name, rows]) => ({ name, rows }));

  function qtyAt(item: InventoryItem, locationId?: string) {
    if (!locationId || locations.length <= 1) return item.quantity;
    return item.byLocation.find((row) => row.locationId === locationId)?.quantity ?? 0;
  }

  async function refresh(id?: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ingredients"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["balances"] }),
      id ? queryClient.invalidateQueries({ queryKey: ["inventory-moves", id] }) : Promise.resolve(),
    ]);
  }

  function draftOf(item?: InventoryItem, barcode?: string): Draft {
    const unit = item?.unit ?? "pz";
    return {
      id: item?.id,
      name: item?.name ?? "",
      unit,
      customUnit: !UNITS.includes(unit),
      category: item?.category ?? (category && category !== NO_CATEGORY ? category : ""),
      minQuantity: item?.minQuantity != null ? inputQty(item.minQuantity) : "",
      unitCost: item?.unitCost != null ? inputQty(item.unitCost) : "",
      supplierId: item?.supplierId ?? null,
      sku: item?.sku ?? "",
      barcode: item?.barcode ?? barcode ?? "",
      initial: "",
    };
  }

  function patchDraft(patch: Partial<Draft>) {
    setPanel((current) => (current?.kind === "edit" ? { ...current, draft: { ...current.draft, ...patch } } : current));
  }

  function openItem(item: InventoryItem) {
    moveMutation.reset();
    const kind: InventoryMove = levelOf(item) === "ok" ? "OUT" : "IN";
    setMove(kind);
    setMoveQty(kind === "IN" && reorderQuantity(item.quantity, item.minQuantity) > 0 ? String(reorderQuantity(item.quantity, item.minQuantity)) : "");
    setMoveCost("");
    setMoveNote("");
    setMoveLocation(null);
    setMoveDone(null);
    setPanel({ kind: "item", id: item.id });
  }

  function openEdit(item?: InventoryItem, barcode?: string) {
    saveMutation.reset();
    removeMutation.reset();
    setConfirmDelete(false);
    setPanel({ kind: "edit", draft: draftOf(item, barcode) });
  }

  function openReorder() {
    orderMutation.reset();
    setOrderQty(Object.fromEntries(toOrder.map((item) => [item.id, String(reorderQuantity(item.quantity, item.minQuantity))])));
    setSent({});
    setPanel({ kind: "reorder" });
  }

  function openCount() {
    countMutation.reset();
    setCounts({});
    setMoveLocation(null);
    setPanel({ kind: "count" });
  }

  function chooseMove(kind: InventoryMove) {
    setMove(kind);
    setMoveDone(null);
    moveMutation.reset();
    if (kind === "COUNT" && selected) setMoveQty(inputQty(Math.max(qtyAt(selected, moveAt?.id), 0)));
    else if (kind === "IN" && selected && reorderQuantity(selected.quantity, selected.minQuantity) > 0) setMoveQty(String(reorderQuantity(selected.quantity, selected.minQuantity)));
    else setMoveQty("");
  }

  function chooseLocation(id: string) {
    setMoveLocation(id);
    if (move === "COUNT" && selected) setMoveQty(inputQty(Math.max(qtyAt(selected, id), 0)));
  }

  const saveMutation = useMutation({
    mutationFn: async (draft: Draft) => {
      const body = ingredientSchema.parse({
        name: draft.name,
        unit: draft.unit.trim(),
        category: draft.category.trim() || null,
        sku: draft.sku.trim() || null,
        barcode: draft.barcode.trim() || null,
        minQuantity: optionalNumber(draft.minQuantity, "Scorta minima"),
        unitCost: optionalNumber(draft.unitCost, "Costo"),
        supplierId: draft.supplierId,
      });
      if (draft.id) {
        await http.patch(`/ingredients/${draft.id}`, body);
        return draft.id;
      }
      const initial = optionalNumber(draft.initial, "Giacenza iniziale");
      const created = await http.post<{ id: string }>("/ingredients", body);
      if (initial) await http.post(`/ingredients/${created.id}/movements`, { kind: "IN", quantity: initial, locationId: defaultLocation?.id ?? null, note: "Giacenza iniziale" });
      return created.id;
    },
    onSuccess: async (id) => {
      await refresh(id);
      const fresh = queryClient.getQueryData<InventoryItem[]>(["ingredients"])?.find((item) => item.id === id);
      if (fresh) openItem(fresh);
      else setPanel(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => http.del(`/ingredients/${id}`),
    onSuccess: async () => {
      setPanel(null);
      await refresh();
    },
  });

  const moveMutation = useMutation({
    mutationFn: (item: InventoryItem) => {
      const quantity = parseQty(moveQty);
      if (Number.isNaN(quantity) || quantity < 0 || (move !== "COUNT" && quantity === 0)) throw new Error("Scrivi la quantità");
      const unitCost = move === "IN" ? optionalNumber(moveCost, "Costo") : null;
      return http.post<{ quantity: number; delta: number }>(`/ingredients/${item.id}/movements`, {
        kind: move,
        quantity,
        locationId: moveAt?.id ?? null,
        unitCost,
        note: moveNote.trim() || null,
      });
    },
    onSuccess: async (result, item) => {
      const label = move === "COUNT" ? (result.delta === 0 ? "La conta torna, niente da correggere" : `Rettificato di ${result.delta > 0 ? "+" : "−"}${formatQty(Math.abs(result.delta))} ${item.unit}`) : "Registrato";
      setMoveDone(label);
      setMoveQty(move === "COUNT" ? inputQty(Math.max(result.quantity, 0)) : "");
      setMoveCost("");
      setMoveNote("");
      await refresh(item.id);
    },
  });

  const orderMutation = useMutation({
    mutationFn: (group: { supplierId: string; rows: InventoryItem[] }) => {
      const lines = group.rows
        .map((item) => ({ item, quantity: parseQty(orderQty[item.id] ?? "") }))
        .filter((line) => line.quantity > 0)
        .map((line) => ({ ingredientId: line.item.id, description: line.item.name, quantity: line.quantity, unitPrice: line.item.unitCost ?? 0 }));
      if (!lines.length) throw new Error("Scrivi almeno una quantità");
      return http.post("/purchase-orders", { supplierId: group.supplierId, lines });
    },
    onSuccess: async (_result, group) => {
      setSent((current) => ({ ...current, [group.supplierId]: true }));
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const countMutation = useMutation({
    mutationFn: async () => {
      const locationId = moveAt?.id ?? null;
      const changes = items
        .map((item) => ({ item, counted: parseQty(counts[item.id] ?? "") }))
        .filter((row) => !Number.isNaN(row.counted) && row.counted >= 0 && Math.abs(row.counted - qtyAt(row.item, locationId ?? undefined)) > 0.0005);
      for (const row of changes) {
        await http.post(`/ingredients/${row.item.id}/movements`, { kind: "COUNT", quantity: row.counted, locationId });
      }
      return changes.length;
    },
    onSuccess: async () => {
      setCounts({});
      await refresh();
    },
  });

  const bySupplier = new Map<string, { supplierId: string | null; name: string; rows: InventoryItem[] }>();
  for (const item of toOrder) {
    const key = item.supplier?.id ?? "";
    const group = bySupplier.get(key) ?? { supplierId: item.supplier?.id ?? null, name: item.supplier?.name ?? "Senza fornitore", rows: [] };
    group.rows.push(item);
    bySupplier.set(key, group);
  }
  const reorderGroups = [...bySupplier.values()].sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.name.localeCompare(b.name, "it"));

  async function shareList() {
    const lines = [`Da ordinare · ${manifest.data?.tenant.name ?? title}`];
    for (const group of reorderGroups) {
      const rows = group.rows.filter((item) => parseQty(orderQty[item.id] ?? "") > 0);
      if (!rows.length) continue;
      lines.push("", group.name);
      for (const item of rows) lines.push(`• ${item.name}: ${formatQty(parseQty(orderQty[item.id] ?? ""))} ${item.unit}`);
    }
    await Share.share({ message: lines.join("\n") }).catch(() => undefined);
  }

  function applyScan(code: string) {
    const target = scanFor;
    setScanFor(null);
    const trimmed = code.trim();
    if (!trimmed) return;
    if (target === "barcode") {
      patchDraft({ barcode: trimmed });
      return;
    }
    const found = items.find((item) => matchesScannedCode({ sku: item.sku ?? "", barcode: item.barcode }, trimmed));
    if (found) openItem(found);
    else if (writable) openEdit(undefined, trimmed);
    else setSearch(trimmed);
  }

  if (scanFor) {
    return <BarcodeScan title={scanFor === "barcode" ? "Codice a barre" : "Trova articolo"} onClose={() => setScanFor(null)} onCode={applyScan} />;
  }

  const sheetTitle =
    panel?.kind === "item" ? (selected?.name ?? "") : panel?.kind === "edit" ? (panel.draft.id ? "Modifica articolo" : "Nuovo articolo") : panel?.kind === "reorder" ? "Da ordinare" : panel?.kind === "count" ? "Conta inventario" : "";

  function renderItem(item: InventoryItem) {
    const level = levelOf(item);
    const color = colorOf(level);
    const current = qtyAt(item, moveAt?.id);
    const amount = parseQty(moveQty);
    const after = Number.isNaN(amount) ? null : move === "IN" ? current + amount : move === "COUNT" ? amount : current - amount;
    const suggested = reorderQuantity(item.quantity, item.minQuantity);
    const left = daysLeft(item.quantity, item.usedLast30);
    const saveLabel = move === "IN" ? "Registra carico" : move === "OUT" ? "Registra consumo" : move === "WASTE" ? "Registra scarto" : "Salva conta";
    return (
      <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Badge label={level === "out" ? "Esaurito" : level === "low" ? "Sotto scorta" : "Disponibile"} tone={level === "out" ? "danger" : level === "low" ? "warning" : "success"} />
          {item.category ? <Badge label={item.category} /> : null}
          {item.supplier ? <Badge label={item.supplier.name} tone="accent" /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Stat label="Giacenza" value={`${formatQty(Math.max(item.quantity, 0))} ${item.unit}`} color={level === "ok" ? undefined : color} />
          <Stat label="Scorta minima" value={item.minQuantity ? `${formatQty(item.minQuantity)} ${item.unit}` : "—"} />
          <Stat label="Valore" value={item.unitCost ? euro(Math.max(item.quantity, 0) * item.unitCost) : "—"} />
        </View>
        <Text variant="caption" muted>
          {[
            item.unitCost ? `${euro(item.unitCost)} per ${item.unit}` : "",
            item.usedLast30 > 0 ? `Usati ${formatQty(item.usedLast30)} ${item.unit} in 30 giorni` : "",
            left != null && left > 0 ? `circa ${left} ${left === 1 ? "giorno" : "giorni"} di autonomia` : "",
            locations.length > 1 && item.byLocation.length ? item.byLocation.map((row) => `${row.name} ${formatQty(row.quantity)}`).join(", ") : "",
          ]
            .filter(Boolean)
            .join(" · ") || (item.minQuantity ? "" : "Imposta una scorta minima per ricevere l'avviso quando sta per finire.")}
        </Text>

        {writable ? (
          <Card style={{ gap: 12 }}>
            <MoveTabs value={move} onChange={chooseMove} />
            {locations.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {locations.map((location) => (
                  <Chip key={location.id} label={`${location.name} · ${formatQty(Math.max(qtyAt(item, location.id), 0))}`} active={location.id === moveAt?.id} onPress={() => chooseLocation(location.id)} />
                ))}
              </View>
            ) : null}
            <Input
              label={move === "COUNT" ? `Quantità contata (${item.unit})` : `Quantità (${item.unit})`}
              value={moveQty}
              onChangeText={(text) => {
                setMoveQty(text);
                setMoveDone(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            {move !== "COUNT" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {move === "IN" && suggested > 0 ? <Chip label={`Suggeriti ${formatQty(suggested)}`} active={parseQty(moveQty) === suggested} tone={theme.colors.success} onPress={() => setMoveQty(String(suggested))} /> : null}
                {[1, 5, 10].map((step) => (
                  <Chip key={step} label={`+${step}`} active={false} onPress={() => setMoveQty(inputQty((Number.isNaN(parseQty(moveQty)) ? 0 : parseQty(moveQty)) + step))} />
                ))}
                {move !== "IN" && current > 0 ? <Chip label={`Tutto (${formatQty(current)})`} active={parseQty(moveQty) === current} onPress={() => setMoveQty(inputQty(current))} /> : null}
              </View>
            ) : null}
            {move === "IN" ? (
              <Input label={`Costo per ${item.unit} (facoltativo)`} value={moveCost} onChangeText={setMoveCost} keyboardType="decimal-pad" placeholder={item.unitCost ? inputQty(item.unitCost) : "0,00"} />
            ) : null}
            {move === "WASTE" || move === "IN" ? (
              <Input label="Nota" value={moveNote} onChangeText={setMoveNote} placeholder={move === "WASTE" ? "Es. scaduto, rotto" : "Es. numero bolla"} />
            ) : null}
            {after != null && !moveDone ? (
              <Text variant="caption" muted>
                {`${locations.length > 1 && moveAt ? `${moveAt.name}: ` : ""}${formatQty(Math.max(current, 0))} → `}
                <Text variant="caption" style={{ fontWeight: "800", color: after < 0 ? theme.colors.danger : theme.colors.ink }}>
                  {`${formatQty(after)} ${item.unit}`}
                </Text>
              </Text>
            ) : null}
            {moveDone ? <Text style={{ color: theme.colors.success, fontWeight: "700" }}>{moveDone}</Text> : null}
            {moveMutation.error ? <Text style={{ color: theme.colors.danger }}>{moveMutation.error.message}</Text> : null}
            <Button label={saveLabel} loading={moveMutation.isPending} disabled={!moveQty.trim()} onPress={() => moveMutation.mutate(item)} />
          </Card>
        ) : null}

        <SectionLabel title="Ultimi movimenti" />
        {history.data?.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {history.data.map((row, index) => (
              <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: theme.colors.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1}>{row.reason ?? (row.quantity > 0 ? "Carico" : "Scarico")}</Text>
                  <Text variant="caption" muted numberOfLines={1}>
                    {[when(row.createdAt), locations.length > 1 ? row.location : ""].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Text variant="heading" style={{ fontVariant: ["tabular-nums"], color: row.quantity > 0 ? theme.colors.success : theme.colors.danger }}>
                  {row.quantity > 0 ? "+" : "−"}
                  {formatQty(Math.abs(row.quantity))}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Text variant="caption" muted>
            {history.isLoading ? "Carico lo storico…" : "Ancora nessun movimento."}
          </Text>
        )}
        {writable ? <Button label="Modifica articolo" tone="secondary" onPress={() => openEdit(item)} /> : null}
      </>
    );
  }

  function renderEdit(draft: Draft) {
    const unitWord = draft.unit.trim() || "unità";
    return (
      <>
        <Input label="Nome" value={draft.name} onChangeText={(name) => patchDraft({ name })} placeholder="Es. Farina 00" />
        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
            Unità di misura
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {UNITS.map((unit) => (
              <Chip key={unit} label={unit} active={!draft.customUnit && draft.unit === unit} onPress={() => patchDraft({ unit, customUnit: false })} />
            ))}
            <Chip label="Altra" active={draft.customUnit} onPress={() => patchDraft({ customUnit: true, unit: draft.customUnit ? draft.unit : "" })} />
          </View>
          {draft.customUnit ? <Input label="Unità" value={draft.unit} onChangeText={(unit) => patchDraft({ unit })} placeholder="Es. vaschetta" /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input label={`Scorta minima (${unitWord})`} value={draft.minQuantity} onChangeText={(minQuantity) => patchDraft({ minQuantity })} keyboardType="decimal-pad" placeholder="Es. 5" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label={`Costo per ${unitWord} (€)`} value={draft.unitCost} onChangeText={(unitCost) => patchDraft({ unitCost })} keyboardType="decimal-pad" placeholder="0,00" />
          </View>
        </View>
        <Text variant="caption" muted>
          Sotto la scorta minima l'articolo finisce tra quelli da riordinare e ricevi un avviso.
        </Text>
        {!draft.id ? (
          <Input label={`Giacenza iniziale (${unitWord})`} value={draft.initial} onChangeText={(initial) => patchDraft({ initial })} keyboardType="decimal-pad" placeholder="Quanto ne hai adesso" />
        ) : null}
        <View style={{ gap: 8 }}>
          <Input label="Categoria" value={draft.category} onChangeText={(value) => patchDraft({ category: value })} placeholder="Es. Latticini, Bevande" />
          {categories.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {categories.map((name) => (
                <Chip key={name} label={name} active={draft.category.trim() === name} onPress={() => patchDraft({ category: draft.category.trim() === name ? "" : name })} />
              ))}
            </View>
          ) : null}
        </View>
        {suppliersOn && suppliers.data?.length ? (
          <View style={{ gap: 8 }}>
            <Text variant="label" muted>
              Fornitore abituale
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip label="Nessuno" active={!draft.supplierId} onPress={() => patchDraft({ supplierId: null })} />
              {suppliers.data.map((supplier) => (
                <Chip key={supplier.id} label={supplier.name} active={draft.supplierId === supplier.id} onPress={() => patchDraft({ supplierId: supplier.id })} />
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Input label="Codice" value={draft.sku} onChangeText={(sku) => patchDraft({ sku })} autoCapitalize="characters" autoCorrect={false} placeholder="Facoltativo" />
          </View>
          <View style={{ flex: 1.4 }}>
            <Input label="Codice a barre" value={draft.barcode} onChangeText={(barcode) => patchDraft({ barcode })} autoCorrect={false} keyboardType="number-pad" placeholder="Facoltativo" />
          </View>
          <View style={{ paddingBottom: 9 }}>
            <CircleButton icon="barcode-outline" label="Scansiona codice a barre" onPress={() => setScanFor("barcode")} />
          </View>
        </View>
        {saveMutation.error ? <Text style={{ color: theme.colors.danger }}>{saveMutation.error.message}</Text> : null}
        <Button label="Salva" loading={saveMutation.isPending} disabled={draft.name.trim().length < 2 || !draft.unit.trim()} onPress={() => saveMutation.mutate(draft)} />
        {draft.id ? (
          <>
            {removeMutation.error ? <Text style={{ color: theme.colors.danger }}>{removeMutation.error.message}</Text> : null}
            {confirmDelete ? (
              <Text variant="caption" muted>
                Si cancella anche lo storico dei movimenti. Non si può annullare.
              </Text>
            ) : null}
            <Button
              label={confirmDelete ? "Conferma eliminazione" : "Elimina articolo"}
              tone={confirmDelete ? "danger" : "ghost"}
              loading={removeMutation.isPending}
              onPress={() => (confirmDelete ? removeMutation.mutate(draft.id!) : setConfirmDelete(true))}
            />
          </>
        ) : null}
      </>
    );
  }

  function renderReorder() {
    if (!toOrder.length) {
      return <Text muted>Niente da ordinare: tutti gli articoli sono sopra la scorta minima.</Text>;
    }
    return (
      <>
        <Text muted>Le quantità riportano ogni articolo al doppio della scorta minima. Puoi cambiarle prima di ordinare.</Text>
        {reorderGroups.map((group) => {
          const done = group.supplierId ? sent[group.supplierId] : false;
          const total = group.rows.reduce((sum, item) => sum + (parseQty(orderQty[item.id] ?? "") || 0) * (item.unitCost ?? 0), 0);
          return (
            <Card key={group.supplierId ?? "none"} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
                  {group.name}
                </Text>
                {total > 0 ? (
                  <Text variant="caption" muted style={{ fontVariant: ["tabular-nums"] }}>
                    ~{euro(total)}
                  </Text>
                ) : null}
              </View>
              {group.rows.map((item) => (
                <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colorOf(levelOf(item)) }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{item.name}</Text>
                    <Text variant="caption" muted>
                      Ne hai {formatQty(Math.max(item.quantity, 0))} {item.unit}
                      {item.minQuantity ? ` su minimo ${formatQty(item.minQuantity)}` : ""}
                    </Text>
                  </View>
                  <TextInput
                    value={orderQty[item.id] ?? ""}
                    onChangeText={(text) => setOrderQty((current) => ({ ...current, [item.id]: text }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.inkSoft}
                    editable={!done}
                    style={{ width: 72, minHeight: 42, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder, backgroundColor: theme.colors.field, color: theme.colors.ink, paddingHorizontal: 10, fontSize: 16, textAlign: "right" }}
                  />
                  <Text variant="caption" muted style={{ width: 34 }}>
                    {item.unit}
                  </Text>
                </View>
              ))}
              {done ? (
                <View style={{ gap: 4 }}>
                  <Badge label="Ordine creato" tone="success" />
                  <Text variant="caption" muted>
                    Quando arriva la merce, ricevila da Fornitori: le scorte si caricano da sole.
                  </Text>
                </View>
              ) : canOrder && group.supplierId ? (
                <Button
                  label={`Ordina a ${group.name}`}
                  tone="soft"
                  loading={orderMutation.isPending && orderMutation.variables?.supplierId === group.supplierId}
                  onPress={() => orderMutation.mutate({ supplierId: group.supplierId!, rows: group.rows })}
                />
              ) : null}
            </Card>
          );
        })}
        {orderMutation.error ? <Text style={{ color: theme.colors.danger }}>{orderMutation.error.message}</Text> : null}
        {canOrder && reorderGroups.some((group) => !group.supplierId) ? (
          <Text variant="caption" muted>
            Scegli il fornitore abituale negli articoli per ordinarli da qui.
          </Text>
        ) : null}
        <Button label="Condividi la lista" tone="secondary" onPress={() => void shareList()} />
      </>
    );
  }

  function renderCount() {
    const sorted = [...items].sort((a, b) => (a.category ?? "~").localeCompare(b.category ?? "~", "it") || a.name.localeCompare(b.name, "it"));
    const filled = sorted.filter((item) => !Number.isNaN(parseQty(counts[item.id] ?? ""))).length;
    return (
      <>
        <Text muted>Scrivi quanto c'è davvero. Lascia vuoto quello che non hai contato: le differenze si correggono da sole.</Text>
        {locations.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {locations.map((location) => (
              <Chip
                key={location.id}
                label={location.name}
                active={location.id === moveAt?.id}
                onPress={() => {
                  setMoveLocation(location.id);
                  setCounts({});
                }}
              />
            ))}
          </View>
        ) : null}
        <Card style={{ paddingVertical: 4 }}>
          {sorted.map((item, index) => {
            const current = qtyAt(item, moveAt?.id);
            const counted = parseQty(counts[item.id] ?? "");
            const diff = Number.isNaN(counted) ? 0 : counted - current;
            return (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: theme.colors.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1}>{item.name}</Text>
                  <Text variant="caption" muted>
                    Risulta {formatQty(Math.max(current, 0))} {item.unit}
                    {Math.abs(diff) > 0.0005 ? (
                      <Text variant="caption" style={{ fontWeight: "800", color: diff > 0 ? theme.colors.success : theme.colors.danger }}>
                        {`  ${diff > 0 ? "+" : "−"}${formatQty(Math.abs(diff))}`}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                <TextInput
                  value={counts[item.id] ?? ""}
                  onChangeText={(text) => setCounts((currentCounts) => ({ ...currentCounts, [item.id]: text }))}
                  keyboardType="decimal-pad"
                  placeholder={formatQty(Math.max(current, 0))}
                  placeholderTextColor={theme.colors.inkSoft}
                  style={{ width: 84, minHeight: 42, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder, backgroundColor: theme.colors.field, color: theme.colors.ink, paddingHorizontal: 10, fontSize: 16, textAlign: "right" }}
                />
                <Text variant="caption" muted style={{ width: 34 }}>
                  {item.unit}
                </Text>
              </View>
            );
          })}
        </Card>
        {countMutation.isSuccess ? (
          <Text style={{ color: theme.colors.success, fontWeight: "700" }}>
            {countMutation.data === 0 ? "Tutto torna, nessuna correzione." : countMutation.data === 1 ? "1 articolo corretto." : `${countMutation.data} articoli corretti.`}
          </Text>
        ) : null}
        {countMutation.error ? <Text style={{ color: theme.colors.danger }}>{countMutation.error.message}</Text> : null}
        <Button label={filled ? `Salva conta (${filled})` : "Salva conta"} loading={countMutation.isPending} disabled={!filled} onPress={() => countMutation.mutate()} />
      </>
    );
  }

  return (
    <Screen onRefresh={() => Promise.all([query.refetch(), locationsQuery.refetch()])}>
      <View style={{ gap: 2 }}>
        <Text variant="display">{title}</Text>
        <Text muted>Carichi, consumi e scarti. Quando qualcosa scende sotto la scorta minima lo trovi da riordinare.</Text>
      </View>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {items.length ? (
          <>
            <StockHero total={items.length} low={low} out={out} value={value} onReorder={toOrder.length ? openReorder : undefined} onCount={writable ? openCount : undefined} />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Input label="Cerca" value={search} onChangeText={setSearch} placeholder="Nome, codice, categoria o fornitore" autoCorrect={false} autoCapitalize="none" />
              </View>
              <View style={{ paddingBottom: 5 }}>
                <CircleButton icon="barcode-outline" label="Scansiona codice" size={44} onPress={() => setScanFor("find")} />
              </View>
            </View>
            <FilterTabs value={filter} counts={{ all: items.length, reorder: toOrder.length, out }} onChange={setFilter} />
            {categories.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="Tutte" active={!category} onPress={() => setCategory(null)} />
                {categories.map((name) => (
                  <Chip key={name} label={name} active={category === name} onPress={() => setCategory(category === name ? null : name)} />
                ))}
              </View>
            ) : null}
            {groups.length ? (
              groups.map((group) => (
                <View key={group.name} style={{ gap: 8 }}>
                  {groups.length > 1 || group.name !== NO_CATEGORY ? <SectionLabel title={group.name} accessory={<Text variant="caption" muted>{group.rows.length}</Text>} /> : null}
                  <Card style={{ paddingVertical: 4 }}>
                    {group.rows.map((item, index) => (
                      <ItemRow key={item.id} item={item} first={index === 0} onPress={() => openItem(item)} />
                    ))}
                  </Card>
                </View>
              ))
            ) : (
              <EmptyState
                title={filter === "out" ? "Niente di esaurito" : filter === "reorder" ? "Niente da riordinare" : "Nessun risultato"}
                message={filter === "all" ? "Nessun articolo corrisponde alla ricerca." : "Tutti gli articoli sono sopra la scorta minima."}
              />
            )}
          </>
        ) : (
          <EmptyState
            title="Ancora nessun articolo"
            message="Aggiungi quello che tieni in magazzino con la scorta minima: ti diciamo noi quando riordinare."
            action={writable ? <Button label="Aggiungi il primo articolo" onPress={() => openEdit()} style={{ alignSelf: "stretch", marginTop: 8 }} /> : undefined}
          />
        )}
      </QueryState>
      {writable ? <Fab onPress={() => openEdit()} /> : null}
      <Sheet visible={Boolean(panel)} title={sheetTitle} onClose={() => setPanel(null)}>
        {panel?.kind === "item" && selected ? renderItem(selected) : null}
        {panel?.kind === "edit" ? renderEdit(panel.draft) : null}
        {panel?.kind === "reorder" ? renderReorder() : null}
        {panel?.kind === "count" ? renderCount() : null}
      </Sheet>
    </Screen>
  );
}
