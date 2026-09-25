import { matchesPartQuery, matchesScannedCode } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Card, EmptyState, Input, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { BarcodeScan } from "../../src/components/BarcodeScan";
import { Chip } from "../../src/components/Chip";
import { RecordPicker } from "../../src/components/RecordPicker";
import { QueryState } from "../../src/components/States";
import { useManifest } from "../../src/session";

interface Part {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
}

interface Location {
  id: string;
  name: string;
  kind: string;
}

interface Balance {
  quantity: number;
  partId?: string | null;
  locationId?: string | null;
}

type Direction = "toVan" | "toWarehouse";

interface Draft {
  part: Part;
  direction: Direction;
  available: number;
}

function formatQty(value: number) {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000).replace(".", ",");
}

function parseQty(value: string) {
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 1000) / 1000 : NaN;
}

export default function StockScreen() {
  const theme = useTheme();
  const manifest = useManifest();
  const terms = manifest.data?.tenant.terminology;
  const vehicleWord = terms?.vehicle ?? "Mezzo";
  const warehouseWord = terms?.warehouse ?? "Magazzino";
  const title = manifest.data?.modules.find((module) => module.key === "stock")?.label ?? warehouseWord;
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [vanId, setVanId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadPart, setLoadPart] = useState<Part | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [loadOpen, setLoadOpen] = useState(false);
  const [loadQuery, setLoadQuery] = useState("");
  const [scanFor, setScanFor] = useState<"list" | "load" | null>(null);

  const balances = useQuery({ queryKey: ["balances"], queryFn: () => http.get<Balance[]>("/stock/balances") });
  const locations = useQuery({ queryKey: ["stock-locations"], queryFn: () => http.get<Location[]>("/stock/locations") });
  const parts = useQuery({ queryKey: ["parts", ""], queryFn: () => http.get<Part[]>("/spare-parts") });

  const warehouses = locations.data?.filter((location) => location.kind === "WAREHOUSE") ?? [];
  const vans = locations.data?.filter((location) => location.kind === "MOBILE") ?? [];
  const warehouse = warehouses.find((location) => location.id === warehouseId) ?? warehouses[0];
  const van = vans.find((location) => location.id === vanId) ?? vans[0];

  function qtyAt(partId: string, locationId?: string) {
    if (!locationId) return 0;
    return balances.data?.find((row) => row.partId === partId && row.locationId === locationId)?.quantity ?? 0;
  }

  const needle = query.trim().toLowerCase();
  const codeLookup = useQuery({
    queryKey: ["parts", "barcode", needle],
    queryFn: () => http.get<Part[]>(`/spare-parts?barcode=${encodeURIComponent(query.trim())}`),
    enabled: needle.length >= 6 && /\d/.test(needle),
  });
  const catalog = useMemo(() => {
    const list = parts.data ?? [];
    const extra = (codeLookup.data ?? []).filter((part) => !list.some((row) => row.id === part.id));
    return extra.length ? [...extra, ...list] : list;
  }, [parts.data, codeLookup.data]);
  const rows = catalog
    .map((part) => ({
      part,
      warehouseQty: qtyAt(part.id, warehouse?.id),
      vanQty: qtyAt(part.id, van?.id),
    }))
    .filter((row) => {
      if (!matchesPartQuery(row.part, query)) return false;
      if (needle) return true;
      return row.warehouseQty > 0 || row.vanQty > 0;
    });

  const transfer = useMutation({
    mutationFn: () => {
      if (!draft || !warehouse || !van) throw new Error(`Scegli ${warehouseWord.toLowerCase()} e ${vehicleWord.toLowerCase()}`);
      const amount = parseQty(quantity);
      if (!(amount > 0)) throw new Error("Scrivi la quantità");
      if (amount > draft.available + 0.0005) throw new Error(`Disponibili solo ${formatQty(draft.available)}`);
      const fromLocationId = draft.direction === "toVan" ? warehouse.id : van.id;
      const toLocationId = draft.direction === "toVan" ? van.id : warehouse.id;
      return http.post("/stock/transfers", { partId: draft.part.id, fromLocationId, toLocationId, quantity: amount });
    },
    onSuccess: async () => {
      setDraft(null);
      setQuantity("1");
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
  });

  const load = useMutation({
    mutationFn: () => {
      if (!loadPart || !warehouse) throw new Error("Scegli un ricambio");
      const amount = parseQty(quantity);
      if (!(amount > 0)) throw new Error("Scrivi la quantità");
      return http.post("/stock/movements", {
        partId: loadPart.id,
        locationId: warehouse.id,
        quantity: amount,
        reason: "Carico magazzino",
      });
    },
    onSuccess: async () => {
      setLoadOpen(false);
      setLoadPart(null);
      setQuantity("1");
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
  });

  const createLocation = useMutation({
    mutationFn: (kind: "WAREHOUSE" | "MOBILE") =>
      http.post("/stock/locations", { name: kind === "MOBILE" ? vehicleWord : warehouseWord, kind }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
    },
  });

  function openTransfer(part: Part, direction: Direction, available: number) {
    transfer.reset();
    setQuantity(available > 0 && available < 1 ? formatQty(available) : "1");
    setDraft({ part, direction, available });
  }

  function openLoad(part?: Part) {
    load.reset();
    setQuantity("1");
    setLoadQuery("");
    setLoadPart(part ?? null);
    setLoadOpen(true);
  }

  const fromLabel = draft?.direction === "toVan" ? warehouse?.name : van?.name;
  const toLabel = draft?.direction === "toVan" ? van?.name : warehouse?.name;
  const loadChoices = catalog.filter((part) => matchesPartQuery(part, loadQuery));

  function pickerSubtitle(part: Part, typed: string) {
    const bits = [part.sku, part.barcode].filter((bit): bit is string => Boolean(bit));
    const needleText = typed.trim().toLowerCase();
    const visible = `${part.name} ${bits.join(" ")}`.toLowerCase();
    if (needleText && !visible.includes(needleText)) bits.push(typed.trim());
    return bits.join(" · ");
  }

  async function applyScan(code: string) {
    const trimmed = code.trim();
    const target = scanFor;
    setScanFor(null);
    if (!trimmed) return;
    if (target === "load") setLoadOpen(true);
    else setQuery(trimmed);
    let found: Part[] = [];
    try {
      found = await http.get<Part[]>(`/spare-parts?barcode=${encodeURIComponent(trimmed)}`);
    } catch {
      found = [];
    }
    if (found.length) {
      queryClient.setQueryData<Part[]>(["parts", ""], (current) => {
        const list = current ?? [];
        const missing = found.filter((part) => !list.some((row) => row.id === part.id));
        return missing.length ? [...missing, ...list] : list;
      });
    }
    if (target !== "load") return;
    const part = found[0] ?? catalog.find((item) => matchesScannedCode(item, trimmed));
    if (part) {
      setLoadPart(part);
      setLoadQuery("");
      return;
    }
    setLoadPart(null);
    setLoadQuery(trimmed);
  }

  if (scanFor) {
    return <BarcodeScan title="Scansiona" onClose={() => setScanFor(null)} onCode={applyScan} />;
  }

  return (
    <Screen>
      <Text variant="display">{title}</Text>
      <Text muted>
        Sposta gli articoli tra {warehouseWord.toLowerCase()} e {vehicleWord.toLowerCase()}. Quello che carichi resta sul mezzo finché non lo riporti indietro.
      </Text>
      <QueryState
        isLoading={balances.isLoading || locations.isLoading || parts.isLoading}
        error={balances.error ?? locations.error ?? parts.error}
        refetch={() => {
          void balances.refetch();
          void locations.refetch();
          void parts.refetch();
        }}
      >
        {!warehouse || !van ? (
          <EmptyState
            title={`Manca: ${!van ? vehicleWord.toLowerCase() : warehouseWord.toLowerCase()}`}
            message="Servono entrambe le sedi per spostare i ricambi."
            action={
              <View style={{ gap: 8, alignSelf: "stretch" }}>
                {!warehouse ? (
                  <Button label={`Crea ${warehouseWord.toLowerCase()}`} loading={createLocation.isPending} onPress={() => createLocation.mutate("WAREHOUSE")} />
                ) : null}
                {!van ? <Button label={`Crea ${vehicleWord.toLowerCase()}`} loading={createLocation.isPending} onPress={() => createLocation.mutate("MOBILE")} /> : null}
              </View>
            }
          />
        ) : (
          <>
            {warehouses.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {warehouses.map((location) => (
                  <Chip key={location.id} label={location.name} active={location.id === warehouse.id} onPress={() => setWarehouseId(location.id)} />
                ))}
              </View>
            ) : null}
            {vans.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {vans.map((location) => (
                  <Chip key={location.id} label={location.name} active={location.id === van.id} onPress={() => setVanId(location.id)} />
                ))}
              </View>
            ) : null}
            <Input label="Cerca ricambio" value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" />
            <Button label="Scansiona codice" tone="secondary" onPress={() => setScanFor("list")} />
            <Button label={`Carico in ${warehouse.name}`} tone="secondary" onPress={() => openLoad()} />
            {rows.length ? (
              rows.map((row) => (
                <Card key={row.part.id} style={{ gap: 12 }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="heading">{row.part.name}</Text>
                    <Text variant="caption" muted>
                      {[row.part.sku, row.part.barcode].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View
                      style={{
                        flex: 1,
                        gap: 2,
                        padding: 12,
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.colors.field,
                        borderWidth: 1,
                        borderColor: theme.colors.glassBorder,
                      }}
                    >
                      <Text variant="caption" muted>
                        {warehouse.name}
                      </Text>
                      <Text variant="heading">{formatQty(row.warehouseQty)}</Text>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        gap: 2,
                        padding: 12,
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.colors.accentSoft,
                        borderWidth: 1,
                        borderColor: theme.colors.glassBorder,
                      }}
                    >
                      <Text variant="caption" muted>
                        {van.name}
                      </Text>
                      <Text variant="heading">{formatQty(row.vanQty)}</Text>
                    </View>
                  </View>
                  {row.warehouseQty <= 0 && row.vanQty <= 0 ? (
                    <Button label={`Carico in ${warehouse.name}`} tone="secondary" onPress={() => openLoad(row.part)} />
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button
                        label="Carica"
                        tone="secondary"
                        style={{ flex: 1 }}
                        disabled={row.warehouseQty <= 0}
                        onPress={() => openTransfer(row.part, "toVan", row.warehouseQty)}
                      />
                      <Button
                        label="Riporta"
                        tone="secondary"
                        style={{ flex: 1 }}
                        disabled={row.vanQty <= 0}
                        onPress={() => openTransfer(row.part, "toWarehouse", row.vanQty)}
                      />
                    </View>
                  )}
                </Card>
              ))
            ) : (
              <EmptyState
                title={needle ? "Nessun ricambio" : "Niente da spostare"}
                message={
                  needle
                    ? "Nessun ricambio corrisponde alla ricerca."
                    : `Registra un carico in ${warehouseWord.toLowerCase()}, poi caricalo su ${vehicleWord.toLowerCase()}.`
                }
              />
            )}
          </>
        )}
      </QueryState>

      <Sheet
        visible={Boolean(draft)}
        title={draft?.direction === "toVan" ? `Carica su ${van?.name ?? vehicleWord}` : `Riporta in ${warehouse?.name ?? warehouseWord}`}
        onClose={() => setDraft(null)}
      >
        {draft && warehouse && van ? (
          <>
            <Text variant="heading">{draft.part.name}</Text>
            <Text muted>
              Da {fromLabel} a {toLabel}. Disponibili {formatQty(draft.available)}.
            </Text>
            <Input label="Quantità" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip label="1" active={parseQty(quantity) === 1} onPress={() => setQuantity("1")} />
              {draft.available > 1 ? (
                <Chip label={`Tutto (${formatQty(draft.available)})`} active={parseQty(quantity) === draft.available} onPress={() => setQuantity(formatQty(draft.available))} />
              ) : null}
            </View>
            {transfer.error ? <Text>{transfer.error.message}</Text> : null}
            <Button
              label={draft.direction === "toVan" ? "Carica" : "Riporta"}
              loading={transfer.isPending}
              disabled={!quantity.trim()}
              onPress={() => transfer.mutate()}
            />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={loadOpen} title={`Carico in ${warehouse?.name ?? warehouseWord}`} onClose={() => setLoadOpen(false)}>
        <Text muted>
          Entra solo in {warehouse?.name ?? warehouseWord}. Poi lo puoi caricare su {vehicleWord.toLowerCase()}.
        </Text>
        <Button label="Scansiona codice" tone="secondary" onPress={() => setScanFor("load")} />
        <RecordPicker
          label="Ricambio"
          query={loadQuery}
          onQuery={setLoadQuery}
          options={loadChoices.map((part) => ({ id: part.id, title: part.name, subtitle: pickerSubtitle(part, loadQuery) }))}
          value={loadPart?.id ?? null}
          onChange={(id) => setLoadPart(catalog.find((part) => part.id === id) ?? null)}
        />
        <Input label="Quantità" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
        {load.error ? <Text>{load.error.message}</Text> : null}
        <Button label="Registra carico" loading={load.isPending} disabled={!loadPart || !quantity.trim()} onPress={() => load.mutate()} />
      </Sheet>
    </Screen>
  );
}
