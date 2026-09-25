import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Card, Input, ListItem, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL, euro } from "../../../src/format";
import { Chip } from "../../../src/components/Chip";
import { can, useManifest, useVocab, vocabLabel } from "../../../src/session";

interface ModifierRow {
  modifier: { id: string; name: string; priceDelta: string | number };
}
interface Line {
  id: string;
  menuItemId?: string | null;
  name: string;
  quantity: number;
  unitPrice: string | number;
  station: string;
  status: string;
  note?: string | null;
  modifiers?: Array<{ name?: string }> | null;
}
interface Order {
  id: string;
  status: string;
  covers: number;
  table?: { name: string } | null;
  lines: Line[];
}
interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: string | number;
  station: string;
  available?: boolean;
  modifiers: ModifierRow[];
}

export default function OrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const manifest = useManifest();
  const { stations } = useVocab();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [mods, setMods] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState(false);
  const [written, setWritten] = useState("");
  const [price, setPrice] = useState("");
  const [reparto, setReparto] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [flash, setFlash] = useState("");
  const [split, setSplit] = useState(1);
  const order = useQuery({ queryKey: ["order", id], queryFn: () => http.get<Order>(`/orders/${id}`) });
  const editable = order.data ? order.data.status !== "CLOSED" && order.data.status !== "VOID" : false;
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => http.get<MenuItem[]>("/menu-items"), enabled: menuOpen || editable });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["order", id] });
  const add = useMutation({
    mutationFn: (body: { menuItemId?: string; name?: string; unitPrice?: number; station?: string; note?: string; quantity: number; modifierIds?: string[] }) => {
      if (!Number.isInteger(body.quantity) || body.quantity < 1) throw new Error("Scrivi la quantità");
      return http.post<{ name?: string }>(`/orders/${id}/lines`, { ...body, modifierIds: body.modifierIds ?? [] });
    },
    onMutate: () => setFlash("Aggiungo…"),
    onSuccess: async (line) => {
      setFlash(line?.name ? `In comanda: ${line.name}` : "Voce aggiunta");
      setWritten("");
      setPrice("");
      setReparto("");
      setManualQty("1");
      setPicked(null);
      setMods([]);
      setNote("");
      setQty(1);
      await refresh();
    },
    onError: () => setFlash(""),
  });
  const send = useMutation({ mutationFn: () => http.post(`/orders/${id}/send`), onSuccess: refresh });
  const close = useMutation({
    mutationFn: () => {
      const total = totalOf(order.data);
      const share = Math.round((total / split) * 100) / 100;
      const payments = Array.from({ length: split }, (_, index) => ({
        label: split === 1 ? "Conto unico" : `Quota ${index + 1}`,
        amount: index === split - 1 ? Math.round((total - share * (split - 1)) * 100) / 100 : share,
      }));
      return http.post(`/orders/${id}/close`, { payments });
    },
    onSuccess: refresh,
  });
  const voidOrder = useMutation({ mutationFn: () => http.post(`/orders/${id}/void`), onSuccess: refresh });
  const lineStatus = useMutation({
    mutationFn: (input: { lineId: string; status: string }) => http.patch(`/orders/${id}/lines/${input.lineId}`, { status: input.status }),
    onSuccess: refresh,
  });

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of menu.data ?? []) if (item.category) seen.add(item.category);
    return [...seen];
  }, [menu.data]);
  const dishes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (menu.data ?? []).filter((item) => {
      if (category && item.category !== category) return false;
      if (!needle) return true;
      return `${item.name} ${item.category}`.toLowerCase().includes(needle);
    });
  }, [menu.data, search, category]);

  function orderedQty(itemId: string) {
    return (order.data?.lines ?? []).filter((line) => line.menuItemId === itemId && line.status !== "VOID").reduce((sum, line) => sum + line.quantity, 0);
  }

  function closeMenu() {
    setMenuOpen(false);
    setPicked(null);
    setSearch("");
    setCategory("");
    setManual(false);
    setFlash("");
    setQty(1);
    setMods([]);
    setNote("");
  }

  function pick(item: MenuItem) {
    if (add.isPending || item.available === false) return;
    if (item.modifiers.length > 0) {
      setPicked(item);
      setMods([]);
      setNote("");
      return;
    }
    add.mutate({ menuItemId: item.id, quantity: qty });
  }

  function confirmPicked() {
    if (!picked || add.isPending) return;
    add.mutate({ menuItemId: picked.id, quantity: qty, modifierIds: mods, note: note.trim() || undefined });
  }

  const pickedUnit = picked ? unitWithMods(picked, mods) : 0;
  const total = totalOf(order.data);
  return (
    <Screen onBack={() => router.back()}>
      <QueryState isLoading={order.isLoading} error={order.error} refetch={() => order.refetch()}>
        {order.data ? (
          <>
            <Text variant="display">{order.data.table?.name ?? "Banco"}</Text>
            <Text muted>
              {order.data.covers} coperti · {STATUS_LABEL[order.data.status]}
            </Text>
            {order.data.lines.map((line) => (
              <Card key={line.id} style={{ gap: 6 }}>
                <Text variant="heading">
                  {line.quantity}× {line.name}
                </Text>
                <Text muted>{lineSummary(line, stations)}</Text>
                {line.status === "SENT" ? <Button label="Pronto" tone="secondary" onPress={() => lineStatus.mutate({ lineId: line.id, status: "READY" })} /> : null}
              </Card>
            ))}
            <Text variant="title">{euro(total)}</Text>
            {editable ? (
              <>
                <Button label="Aggiungi dal menu" onPress={() => setMenuOpen(true)} />
                <Button label={`Invia a ${stations.map((station) => station.label.toLowerCase()).join(", ")}`} tone="secondary" onPress={() => send.mutate()} />
                <Text variant="label">Dividi il conto</Text>
                <Text muted>{split === 1 ? "Conto unico" : `${split} quote da ${euro(total / split)}`}</Text>
                <Button label={split < 6 ? "Aggiungi una quota" : "Massimo 6 quote"} tone="ghost" onPress={() => setSplit((value) => Math.min(6, value + 1))} />
                <Button label="Chiudi conto" onPress={() => close.mutate()} />
                {can(manifest.data, "orders.void") ? <Button label="Annulla comanda" tone="danger" onPress={() => voidOrder.mutate()} /> : null}
              </>
            ) : (
              <Text muted>Comanda chiusa. Lo scarico magazzino è già stato fatto dalle ricette.</Text>
            )}
            {close.error ? <Text style={{ color: theme.colors.danger }}>{close.error.message}</Text> : null}
            <Sheet visible={menuOpen} title={picked ? picked.name : "Dal menu"} onClose={closeMenu}>
              {picked ? (
                <>
                  <Text muted>
                    {euro(pickedUnit)} cad. · {qty}× {euro(pickedUnit * qty)}
                  </Text>
                  <QuantityStepper value={qty} onChange={setQty} />
                  {picked.modifiers.length ? (
                    <>
                      <Text variant="label">Varianti</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {picked.modifiers.map((row) => (
                          <Chip
                            key={row.modifier.id}
                            label={modifierLabel(row.modifier)}
                            active={mods.includes(row.modifier.id)}
                            onPress={() => setMods((current) => (current.includes(row.modifier.id) ? current.filter((item) => item !== row.modifier.id) : [...current, row.modifier.id]))}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                  <Input label="Nota" value={note} onChangeText={setNote} />
                  {add.error ? <Text style={{ color: theme.colors.danger }}>{add.error.message}</Text> : null}
                  <Button label="Aggiungi" loading={add.isPending} onPress={confirmPicked} />
                  <Button label="Indietro" tone="ghost" onPress={() => setPicked(null)} />
                </>
              ) : (
                <>
                  <Text muted>Scegli la quantità, poi tocca la voce.</Text>
                  {flash ? <Text>{flash}</Text> : null}
                  <QuantityStepper value={qty} onChange={setQty} />
                  <Input label="Cerca" value={search} onChangeText={setSearch} />
                  {categories.length > 1 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <Chip label="Tutte" active={!category} onPress={() => setCategory("")} />
                      {categories.map((item) => (
                        <Chip key={item} label={item} active={category === item} onPress={() => setCategory(category === item ? "" : item)} />
                      ))}
                    </View>
                  ) : null}
                  {menu.isLoading ? <Text muted>Carico il menu…</Text> : null}
                  {menu.error ? <Text style={{ color: theme.colors.danger }}>{menu.error.message}</Text> : null}
                  {dishes.map((item) => {
                    const count = orderedQty(item.id);
                    const unavailable = item.available === false;
                    const parts = [
                      !category && item.category ? item.category : "",
                      item.modifiers.length ? "Scegli le varianti" : "",
                      unavailable ? "Non disponibile" : "",
                      count ? `In comanda: ${count}` : "",
                    ].filter(Boolean);
                    return (
                      <ListItem
                        key={item.id}
                        title={item.name}
                        subtitle={parts.join(" · ") || undefined}
                        trailing={<Text muted={unavailable}>{euro(item.price)}</Text>}
                        onPress={unavailable ? undefined : () => pick(item)}
                      />
                    );
                  })}
                  {!menu.isLoading && !menu.error && dishes.length === 0 ? (
                    <Text muted>{search.trim() || category ? "Nessun risultato." : "Nessuna voce nel menu."}</Text>
                  ) : null}
                  {add.error && !picked ? <Text style={{ color: theme.colors.danger }}>{add.error.message}</Text> : null}
                  <Button label={manual ? "Nascondi voce scritta" : "Scrivi una voce"} tone="ghost" onPress={() => setManual((value) => !value)} />
                  {manual ? (
                    <>
                      <Input label="Nome" value={written} onChangeText={setWritten} />
                      <Input label="Prezzo" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
                      {stations.length > 1 ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {stations.map(({ key, label }) => (
                            <Chip key={key} label={label} active={reparto === key} onPress={() => setReparto(reparto === key ? "" : key)} />
                          ))}
                        </View>
                      ) : null}
                      <Input label="Quantità" keyboardType="number-pad" value={manualQty} onChangeText={setManualQty} />
                      <Button
                        label="Aggiungi scritto"
                        disabled={written.trim().length < 1 || !manualQty.trim()}
                        loading={add.isPending}
                        onPress={() => add.mutate({ name: written.trim(), unitPrice: Number(price.replace(",", ".")) || 0, station: reparto || undefined, quantity: Number(manualQty.replace(",", ".")) })}
                      />
                    </>
                  ) : null}
                </>
              )}
            </Sheet>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

function QuantityStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="label">Quantità</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button label="−" tone="secondary" disabled={value <= 1} onPress={() => onChange(Math.max(1, value - 1))} style={{ width: 64 }} />
        <Text variant="title" style={{ minWidth: 28, textAlign: "center" }}>
          {value}
        </Text>
        <Button label="+" tone="secondary" disabled={value >= 50} onPress={() => onChange(Math.min(50, value + 1))} style={{ width: 64 }} />
      </View>
    </View>
  );
}

function modifierLabel(modifier: { name: string; priceDelta: string | number }) {
  const delta = Number(modifier.priceDelta);
  if (!delta) return modifier.name;
  return `${modifier.name} · ${delta > 0 ? "+" : ""}${euro(delta)}`;
}

function unitWithMods(item: MenuItem, modifierIds: string[]) {
  const extra = item.modifiers.filter((row) => modifierIds.includes(row.modifier.id)).reduce((sum, row) => sum + Number(row.modifier.priceDelta), 0);
  return Number(item.price) + extra;
}

function lineSummary(line: Line, stations: Array<{ key: string; label: string }>) {
  const extras = Array.isArray(line.modifiers) ? line.modifiers.map((item) => item.name).filter((name): name is string => Boolean(name)) : [];
  return [line.note, extras.join(", "), stations.length > 1 ? vocabLabel(stations, line.station) : "", STATUS_LABEL[line.status], euro(Number(line.unitPrice) * line.quantity)].filter(Boolean).join(" · ");
}

function totalOf(order?: Order) {
  return order?.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0) ?? 0;
}
