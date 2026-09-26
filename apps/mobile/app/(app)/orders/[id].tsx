import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Card, Input, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL, euro, lineStatusLabel, stationPhrase, towardStation } from "../../../src/format";
import { Chip } from "../../../src/components/Chip";
import { useOrderDraft, type DraftLine } from "../../../src/orderDraft";
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
type Stations = Array<{ key: string; label: string }>;

const EMPTY: DraftLine[] = [];

export default function OrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const manifest = useManifest();
  const { stations } = useVocab();
  const draft = useOrderDraft((state) => state.drafts[id] ?? EMPTY);
  const addDraft = useOrderDraft((state) => state.add);
  const changeDraft = useOrderDraft((state) => state.change);
  const clearDraft = useOrderDraft((state) => state.clear);
  const [panel, setPanel] = useState<"menu" | "review" | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [pickedQty, setPickedQty] = useState(1);
  const [mods, setMods] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState(false);
  const [written, setWritten] = useState("");
  const [price, setPrice] = useState("");
  const [reparto, setReparto] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [flash, setFlash] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [split, setSplit] = useState(1);
  const order = useQuery({ queryKey: ["order", id], queryFn: () => http.get<Order>(`/orders/${id}`) });
  const editable = order.data ? order.data.status !== "CLOSED" && order.data.status !== "VOID" : false;
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => http.get<MenuItem[]>("/menu-items"), enabled: editable });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["order", id] }),
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
      queryClient.invalidateQueries({ queryKey: ["tables"] }),
    ]);
  const send = useMutation({
    mutationFn: (lines: DraftLine[]) =>
      http.post(`/orders/${id}/send`, {
        lines: lines.map((line) => ({
          menuItemId: line.menuItemId,
          name: line.menuItemId ? undefined : line.name,
          unitPrice: line.menuItemId ? undefined : line.unitPrice,
          station: line.menuItemId ? undefined : line.station || undefined,
          quantity: line.quantity,
          modifierIds: line.modifierIds,
          note: line.note.trim() || undefined,
        })),
      }),
    onSuccess: async (_result, lines) => {
      const where = stationPhrase(
        [...lines, ...waiting].map((line) => vocabLabel(stations, line.station)),
        "e",
      );
      setSentMessage(where ? `Comanda inviata ${where}.` : "Comanda inviata.");
      clearDraft(id);
      closePanel();
      await refresh();
    },
  });
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
  const voidOrder = useMutation({
    mutationFn: () => http.post(`/orders/${id}/void`),
    onSuccess: async () => {
      clearDraft(id);
      await refresh();
    },
  });
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
  const sections = useMemo(() => sectionsOf(dishes), [dishes]);

  const waiting = order.data?.lines.filter((line) => line.status === "PENDING") ?? [];
  const sent = order.data?.lines.filter((line) => line.status !== "PENDING") ?? [];
  const draftCount = draft.reduce((sum, line) => sum + line.quantity, 0);
  const draftTotal = draft.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const total = totalOf(order.data);
  const showHeads = !category && sections.length > 1;
  const sendWhere = stationPhrase(
    [...draft, ...waiting].map((line) => vocabLabel(stations, line.station)),
    "e",
  );

  function draftQty(itemId: string) {
    return draft.filter((line) => line.menuItemId === itemId).reduce((sum, line) => sum + line.quantity, 0);
  }

  function openMenu() {
    setSentMessage("");
    setPanel("menu");
  }

  function closePanel() {
    setPanel(null);
    setPicked(null);
    setSearch("");
    setCategory("");
    setManual(false);
    setFlash("");
  }

  function plus(item: MenuItem) {
    if (item.available === false) return;
    if (item.modifiers.length > 0) {
      setPicked(item);
      setPickedQty(1);
      setMods([]);
      setNote("");
      return;
    }
    addDraft(id, { menuItemId: item.id, name: item.name, unitPrice: Number(item.price), station: item.station, quantity: 1, modifierIds: [], modifierNames: [], note: "" });
  }

  function minus(item: MenuItem) {
    const last = [...draft].reverse().find((line) => line.menuItemId === item.id);
    if (last) changeDraft(id, last.key, { quantity: last.quantity - 1 });
  }

  function confirmPicked() {
    if (!picked) return;
    const chosen = picked.modifiers.filter((row) => mods.includes(row.modifier.id));
    addDraft(id, {
      menuItemId: picked.id,
      name: picked.name,
      unitPrice: unitWithMods(picked, mods),
      station: picked.station,
      quantity: pickedQty,
      modifierIds: mods,
      modifierNames: chosen.map((row) => row.modifier.name),
      note: note.trim(),
    });
    setFlash(`Nella lista: ${pickedQty}× ${picked.name}`);
    setPicked(null);
  }

  function addWritten() {
    const name = written.trim();
    if (!name) return;
    addDraft(id, {
      name,
      unitPrice: Number(price.replace(",", ".")) || 0,
      station: reparto || stations[0]?.key || "",
      quantity: manualQty,
      modifierIds: [],
      modifierNames: [],
      note: "",
    });
    setFlash(`Nella lista: ${manualQty}× ${name}`);
    setWritten("");
    setPrice("");
    setManualQty(1);
  }

  const title = order.data?.table?.name ?? "Banco";
  return (
    <Screen onBack={() => router.back()}>
      <QueryState isLoading={order.isLoading} error={order.error} refetch={() => order.refetch()}>
        {order.data ? (
          <>
            <Text variant="display">{title}</Text>
            <Text muted>
              {order.data.covers} coperti · {STATUS_LABEL[order.data.status]}
            </Text>
            {sentMessage ? <Text style={{ color: theme.colors.success }}>{sentMessage}</Text> : null}

            {editable && draft.length ? (
              <Card style={{ gap: 10 }}>
                <Text variant="heading">Da inviare</Text>
                {draft.map((line) => (
                  <DraftRow key={line.key} line={line} stations={stations} onQty={(quantity) => changeDraft(id, line.key, { quantity })} />
                ))}
                <Button label={`Rivedi e invia · ${euro(draftTotal)}`} onPress={() => setPanel("review")} />
              </Card>
            ) : null}

            {editable ? (
              <Button label={draft.length ? "Aggiungi dal menu" : "Prendi l'ordine"} tone={draft.length ? "secondary" : "primary"} onPress={openMenu} />
            ) : null}
            {editable && !draft.length && waiting.length ? (
              <Button label="Invia le voci in attesa" tone="secondary" loading={send.isPending} onPress={() => send.mutate([])} />
            ) : null}
            {send.error && panel === null ? <Text style={{ color: theme.colors.danger }}>{send.error.message}</Text> : null}

            {sent.length || waiting.length ? <Text variant="title">Già in comanda</Text> : null}
            {[...waiting, ...sent].map((line) => (
              <Card key={line.id} style={{ gap: 6 }}>
                <Text variant="heading">
                  {line.quantity}× {line.name}
                </Text>
                <Text muted>{lineSummary(line, stations)}</Text>
                {line.status === "SENT" ? <Button label="Pronto" tone="secondary" onPress={() => lineStatus.mutate({ lineId: line.id, status: "READY" })} /> : null}
              </Card>
            ))}
            {editable && !draft.length && !sent.length && !waiting.length ? <Text muted>Tocca «Prendi l'ordine», scegli i prodotti e invia: parte tutto insieme.</Text> : null}

            <Text variant="title">{euro(total)}</Text>
            {editable ? (
              <>
                <Text variant="label">Dividi il conto</Text>
                <Text muted>{split === 1 ? "Conto unico" : `${split} quote da ${euro(total / split)}`}</Text>
                <Button label={split < 6 ? "Aggiungi una quota" : "Massimo 6 quote"} tone="ghost" onPress={() => setSplit((value) => Math.min(6, value + 1))} />
                <Button label="Chiudi conto" disabled={draft.length > 0} onPress={() => close.mutate()} />
                {draft.length ? <Text muted>Invia o svuota la lista prima di chiudere il conto.</Text> : null}
                {can(manifest.data, "orders.void") ? <Button label="Annulla comanda" tone="danger" onPress={() => voidOrder.mutate()} /> : null}
              </>
            ) : (
              <Text muted>Comanda chiusa.</Text>
            )}
            {close.error ? <Text style={{ color: theme.colors.danger }}>{close.error.message}</Text> : null}

            <Sheet visible={panel !== null} title={panel === "review" ? `Riepilogo · ${title}` : picked ? picked.name : `Ordine · ${title}`} onClose={closePanel}>
              {panel === "review" ? (
                <>
                  {groupByStation(draft, stations).map((group) => (
                    <View key={group.station} style={{ gap: 10 }}>
                      {group.label ? <Text variant="label">{group.label}</Text> : null}
                      {group.lines.map((line) => (
                        <View key={line.key} style={{ gap: 6 }}>
                          <DraftRow line={line} stations={stations} onQty={(quantity) => changeDraft(id, line.key, { quantity })} />
                          <Input label="Nota" placeholder="Es. senza cipolla, ben cotta" value={line.note} onChangeText={(text) => changeDraft(id, line.key, { note: text })} />
                        </View>
                      ))}
                    </View>
                  ))}
                  {waiting.length ? <Text muted>Partono anche {waiting.length === 1 ? "una voce rimasta" : `${waiting.length} voci rimaste`} in attesa.</Text> : null}
                  {draft.length ? (
                    <Text variant="title">
                      {draftCount} {draftCount === 1 ? "voce" : "voci"} · {euro(draftTotal)}
                    </Text>
                  ) : (
                    <Text muted>La lista è vuota.</Text>
                  )}
                  {send.error ? <Text style={{ color: theme.colors.danger }}>{send.error.message}</Text> : null}
                  <Button
                    label={sendWhere ? `Invia ${sendWhere}` : "Invia comanda"}
                    disabled={!draft.length && !waiting.length}
                    loading={send.isPending}
                    onPress={() => send.mutate(draft)}
                  />
                  <Button label="Aggiungi altro" tone="ghost" onPress={() => setPanel("menu")} />
                </>
              ) : picked ? (
                <>
                  <Text muted>
                    {euro(unitWithMods(picked, mods))} cad. · {pickedQty}× {euro(unitWithMods(picked, mods) * pickedQty)}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text variant="label">Quantità</Text>
                    <Stepper value={pickedQty} onChange={(value) => setPickedQty(Math.max(1, value))} />
                  </View>
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
                  <Input label="Nota" placeholder="Es. senza cipolla, ben cotta" value={note} onChangeText={setNote} />
                  <Button label="Metti nella lista" onPress={confirmPicked} />
                  <Button label="Indietro" tone="ghost" onPress={() => setPicked(null)} />
                </>
              ) : (
                <>
                  {draft.length ? (
                    <Button label={`Rivedi e invia · ${draftCount} ${draftCount === 1 ? "voce" : "voci"} · ${euro(draftTotal)}`} onPress={() => setPanel("review")} />
                  ) : (
                    <Text muted>Usa + e − accanto ai prodotti. Non parte niente finché non rivedi e invii.</Text>
                  )}
                  {flash ? <Text>{flash}</Text> : null}
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
                  {sections.map((section) => (
                    <View key={section.category}>
                      {showHeads ? <Text variant="label">{section.category}</Text> : null}
                      {section.items.map((item) => (
                        <MenuRow key={item.id} item={item} count={draftQty(item.id)} stations={stations} onPlus={() => plus(item)} onMinus={() => minus(item)} />
                      ))}
                    </View>
                  ))}
                  {!menu.isLoading && !menu.error && dishes.length === 0 ? (
                    <Text muted>{search.trim() || category ? "Nessun risultato." : "Nessuna voce nel menu."}</Text>
                  ) : null}
                  <Button
                    label={manual ? "Nascondi voce scritta" : "Non è nel menu"}
                    tone="ghost"
                    onPress={() =>
                      setManual((value) => {
                        if (!value && !reparto && stations[0]) setReparto(stations[0].key);
                        return !value;
                      })
                    }
                  />
                  {manual ? (
                    <>
                      <Input label="Nome" value={written} onChangeText={setWritten} />
                      <Input label="Prezzo" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
                      {stations.length > 1 ? (
                        <View style={{ gap: 8 }}>
                          <Text variant="label">Dove la mandi</Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {stations.map(({ key, label }) => (
                              <Chip key={key} label={label} active={reparto === key} onPress={() => setReparto(key)} />
                            ))}
                          </View>
                        </View>
                      ) : null}
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text variant="label">Quantità</Text>
                        <Stepper value={manualQty} onChange={(value) => setManualQty(Math.max(1, value))} />
                      </View>
                      <Button label="Metti nella lista" disabled={written.trim().length < 1} onPress={addWritten} />
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

function MenuRow({ item, count, stations, onPlus, onMinus }: { item: MenuItem; count: number; stations: Stations; onPlus: () => void; onMinus: () => void }) {
  const theme = useTheme();
  const unavailable = item.available === false;
  const where = stations.length > 1 ? towardStation(vocabLabel(stations, item.station)) : "";
  const subtitle = [euro(item.price), where ? `Va ${where}` : "", item.modifiers.length ? "Con varianti" : "", unavailable ? "Non disponibile" : ""].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, opacity: unavailable ? 0.5 : 1 }}>
      <Pressy onPress={unavailable ? undefined : onPlus} disabled={unavailable} haptic="none" scaleTo={0.98} style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{item.name}</Text>
        <Text variant="caption" muted>
          {subtitle}
        </Text>
      </Pressy>
      {unavailable ? null : <Stepper value={count} onChange={(value) => (value > count ? onPlus() : onMinus())} />}
    </View>
  );
}

function DraftRow({ line, stations, onQty }: { line: DraftLine; stations: Stations; onQty: (quantity: number) => void }) {
  const where = stations.length > 1 ? towardStation(vocabLabel(stations, line.station)) : "";
  const detail = [line.modifierNames.join(", "), line.note.trim(), where, euro(line.unitPrice * line.quantity)].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{line.name}</Text>
        <Text variant="caption" muted>
          {detail}
        </Text>
      </View>
      <Stepper value={line.quantity} onChange={onQty} />
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const theme = useTheme();
  const round = (label: string, disabled: boolean, next: number, accent: boolean) => (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={label === "+" ? "Aggiungi uno" : "Togli uno"}
      disabled={disabled}
      hitSlop={6}
      scaleTo={0.9}
      onPress={() => onChange(next)}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: accent ? theme.colors.accent : theme.colors.field,
        borderWidth: 1,
        borderColor: accent ? theme.colors.accent : theme.colors.glassBorder,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Text style={{ fontSize: 20, lineHeight: 22, fontWeight: "700", color: accent ? theme.colors.accentInk : theme.colors.ink }}>{label === "+" ? "+" : "−"}</Text>
    </Pressy>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {round("−", value <= 0, value - 1, false)}
      <Text variant="heading" style={{ minWidth: 26, textAlign: "center" }}>
        {value}
      </Text>
      {round("+", value >= 50, value + 1, true)}
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

function groupByStation(lines: DraftLine[], stations: Stations) {
  const keys = [...new Set(lines.map((line) => line.station))];
  return keys.map((station) => {
    const where = stations.length > 1 ? towardStation(vocabLabel(stations, station)) : "";
    return { station, label: where ? `Va ${where}` : "", lines: lines.filter((line) => line.station === station) };
  });
}

function sectionsOf(items: MenuItem[]) {
  const order: string[] = [];
  const map = new Map<string, MenuItem[]>();
  for (const item of items) {
    const category = item.category || "Altro";
    const list = map.get(category);
    if (list) list.push(item);
    else {
      order.push(category);
      map.set(category, [item]);
    }
  }
  return order.map((category) => ({ category, items: map.get(category)! }));
}

function lineSummary(line: Line, stations: Stations) {
  const extras = Array.isArray(line.modifiers) ? line.modifiers.map((item) => item.name).filter((name): name is string => Boolean(name)) : [];
  return [line.note, extras.join(", "), lineStatusLabel(line.status, vocabLabel(stations, line.station)), euro(Number(line.unitPrice) * line.quantity)].filter(Boolean).join(" · ");
}

function totalOf(order?: Order) {
  return order?.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0) ?? 0;
}
