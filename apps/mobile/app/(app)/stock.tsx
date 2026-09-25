import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, EmptyState, Input, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { RecordPicker } from "../../src/components/RecordPicker";
import { QueryState } from "../../src/components/States";

interface Part {
  id: string;
  sku: string;
  name: string;
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
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [vanId, setVanId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadPart, setLoadPart] = useState<Part | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [loadOpen, setLoadOpen] = useState(false);
  const [loadQuery, setLoadQuery] = useState("");

  const balances = useQuery({ queryKey: ["balances"], queryFn: () => http.get<Balance[]>("/stock/balances") });
  const locations = useQuery({ queryKey: ["stock-locations"], queryFn: () => http.get<Location[]>("/stock/locations") });
  const parts = useQuery({ queryKey: ["parts", ""], queryFn: () => http.get<Part[]>("/spare-parts") });

  const warehouses = locations.data?.filter((location) => location.kind === "WAREHOUSE") ?? [];
  const vans = locations.data?.filter((location) => location.kind === "VAN") ?? [];
  const warehouse = warehouses.find((location) => location.id === warehouseId) ?? warehouses[0];
  const van = vans.find((location) => location.id === vanId) ?? vans[0];

  function qtyAt(partId: string, locationId?: string) {
    if (!locationId) return 0;
    return balances.data?.find((row) => row.partId === partId && row.locationId === locationId)?.quantity ?? 0;
  }

  const needle = query.trim().toLowerCase();
  const rows = (parts.data ?? [])
    .map((part) => ({
      part,
      warehouseQty: qtyAt(part.id, warehouse?.id),
      vanQty: qtyAt(part.id, van?.id),
    }))
    .filter((row) => {
      const matches = !needle || row.part.name.toLowerCase().includes(needle) || row.part.sku.toLowerCase().includes(needle);
      if (!matches) return false;
      if (needle) return true;
      return row.warehouseQty > 0 || row.vanQty > 0;
    });

  const transfer = useMutation({
    mutationFn: () => {
      if (!draft || !warehouse || !van) throw new Error("Scegli magazzino e furgone");
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
    mutationFn: (kind: "WAREHOUSE" | "VAN") =>
      http.post("/stock/locations", { name: kind === "VAN" ? "Furgone" : "Magazzino", kind }),
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
  const loadNeedle = loadQuery.trim().toLowerCase();
  const loadChoices = (parts.data ?? []).filter(
    (part) => !loadNeedle || part.name.toLowerCase().includes(loadNeedle) || part.sku.toLowerCase().includes(loadNeedle),
  );

  return (
    <Screen>
      <Text variant="display">Furgone</Text>
      <Text muted>Sposta i ricambi tra magazzino e furgone. Quello che carichi resta sul mezzo finché non lo riporti indietro.</Text>
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
            title={!van ? "Nessun furgone" : "Nessun magazzino"}
            message="Servono entrambe le sedi per spostare i ricambi."
            action={
              <View style={{ gap: 8, alignSelf: "stretch" }}>
                {!warehouse ? (
                  <Button label="Crea magazzino" loading={createLocation.isPending} onPress={() => createLocation.mutate("WAREHOUSE")} />
                ) : null}
                {!van ? <Button label="Crea furgone" loading={createLocation.isPending} onPress={() => createLocation.mutate("VAN")} /> : null}
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
            <Input label="Cerca ricambio" value={query} onChangeText={setQuery} />
            <Button label={`Carico in ${warehouse.name}`} tone="secondary" onPress={() => openLoad()} />
            {rows.length ? (
              rows.map((row) => (
                <Card key={row.part.id} style={{ gap: 12 }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="heading">{row.part.name}</Text>
                    <Text variant="caption" muted>
                      {row.part.sku}
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
                    : "Registra un carico in magazzino, poi caricalo sul furgone."
                }
              />
            )}
          </>
        )}
      </QueryState>

      <Sheet
        visible={Boolean(draft)}
        title={draft?.direction === "toVan" ? `Carica sul ${van?.name ?? "furgone"}` : `Riporta in ${warehouse?.name ?? "magazzino"}`}
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

      <Sheet visible={loadOpen} title={`Carico in ${warehouse?.name ?? "magazzino"}`} onClose={() => setLoadOpen(false)}>
        <Text muted>Entra solo nel magazzino. Poi lo puoi caricare sul furgone.</Text>
        <RecordPicker
          label="Ricambio"
          query={loadQuery}
          onQuery={setLoadQuery}
          options={loadChoices.map((part) => ({ id: part.id, title: part.name, subtitle: part.sku }))}
          value={loadPart?.id ?? null}
          onChange={(id) => setLoadPart((parts.data ?? []).find((part) => part.id === id) ?? null)}
        />
        <Input label="Quantità" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
        {load.error ? <Text>{load.error.message}</Text> : null}
        <Button label="Registra carico" loading={load.isPending} disabled={!loadPart || !quantity.trim()} onPress={() => load.mutate()} />
      </Sheet>
    </Screen>
  );
}
