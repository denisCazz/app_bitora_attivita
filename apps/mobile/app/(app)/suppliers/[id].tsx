import { ledgerEntrySchema, purchaseOrderSchema, supplierSchema } from "@rapportini/shared";
import type { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { Badge, Button, Card, Input, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { DateField } from "../../../src/components/DateField";
import { SupplierFields } from "../../../src/components/SupplierFields";
import { QueryState } from "../../../src/components/States";
import { euro, STATUS_LABEL, when } from "../../../src/format";
import { can, useCanUse, useManifest, useVocab } from "../../../src/session";
import {
  amount,
  dayLabel,
  emptyLine,
  isoDay,
  orderTone,
  orderTotal,
  qty,
  reorderQty,
  supplierDraft,
  supplierIssue,
  type OrderLineDraft,
  type SupplierDraft,
} from "../../../src/suppliers";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  sku?: string | null;
  category?: string | null;
  minQuantity?: number | null;
  unitCost?: number | null;
  quantity: number;
  supplier?: { id: string; name: string } | null;
}

interface Place {
  id: string;
  name: string;
}

interface SupplierDetail {
  id: string;
  name: string;
  vat?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  ingredients: Array<{ id: string; name: string; unit: string; unitCost?: string | number | null; minQuantity?: string | number | null }>;
  orders: Array<{
    id: string;
    status: string;
    notes?: string | null;
    expectedAt?: string | null;
    receivedAt?: string | null;
    createdAt: string;
    lines: Array<{ id: string; description: string; quantity: string | number; unitPrice: string | number; ingredientId?: string | null; ingredient?: { unit: string } | null }>;
  }>;
  ledgerEntries: Array<{ id: string; kind: string; date: string; amount: string | number; category: string; description?: string | null; paid: boolean }>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="heading">{value}</Text>
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const writable = can(manifest.data, "suppliers.write");
  const canReceive = can(manifest.data, "inventory.write");
  const stockOn = useCanUse("inventory") && can(manifest.data, "inventory.read");
  const stockWrite = stockOn && can(manifest.data, "inventory.write");
  const accounting = useCanUse("accounting") && can(manifest.data, "accounting.read");
  const accountingWrite = accounting && can(manifest.data, "accounting.write");
  const expensePresets = useVocab().ledger.expense;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SupplierDraft>(supplierDraft({ name: "" }));
  const [formError, setFormError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [lines, setLines] = useState<OrderLineDraft[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [expected, setExpected] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [paid, setPaid] = useState(true);

  const query = useQuery({ queryKey: ["supplier", id], queryFn: () => http.get<SupplierDetail>(`/suppliers/${id}`) });
  const stock = useQuery({ queryKey: ["ingredients"], queryFn: () => http.get<StockItem[]>("/ingredients"), enabled: stockOn });
  const places = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => http.get<Place[]>("/inventory/locations"),
    enabled: stockOn && Boolean(receiving),
  });

  const supplier = query.data;
  const catalog = stock.data ?? [];
  const supplied = catalog.filter((item) => item.supplier?.id === id);
  const articles = supplied.length
    ? supplied
    : (supplier?.ingredients ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: 0,
        minQuantity: item.minQuantity == null ? null : amount(item.minQuantity),
        unitCost: item.unitCost == null ? null : amount(item.unitCost),
        supplier: { id: id ?? "", name: supplier?.name ?? "" },
      }));
  const low = supplied.filter((item) => item.minQuantity != null && item.minQuantity > 0 && item.quantity <= item.minQuantity);
  const unlinked = catalog.filter((item) => item.supplier?.id !== id);
  const openOrders = (supplier?.orders ?? []).filter((order) => order.status === "DRAFT" || order.status === "SENT");
  const expenses = (supplier?.ledgerEntries ?? []).filter((entry) => entry.kind === "EXPENSE");
  const unpaid = expenses.filter((entry) => !entry.paid).reduce((sum, entry) => sum + amount(entry.amount), 0);
  const receivingOrder = supplier?.orders.find((order) => order.id === receiving);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["supplier", id] });
    await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  }

  const save = useMutation({
    mutationFn: (values: z.infer<typeof supplierSchema>) => http.patch(`/suppliers/${id}`, values),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => http.del(`/suppliers/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      router.back();
    },
  });
  const order = useMutation({
    mutationFn: () => {
      const parsedLines = lines
        .map((line) => ({
          description: line.description.trim(),
          quantity: Number(line.quantity.replace(",", ".")),
          unitPrice: Number(line.price.replace(",", ".")) || 0,
          ingredientId: line.ingredientId,
        }))
        .filter((line) => line.description || line.quantity);
      if (!parsedLines.length) throw new Error("Aggiungi almeno una riga");
      if (parsedLines.some((line) => !line.description)) throw new Error("Ogni riga ha bisogno di una descrizione");
      if (parsedLines.some((line) => !(line.quantity > 0))) throw new Error("La quantità deve essere maggiore di zero");
      return http.post("/purchase-orders", purchaseOrderSchema.parse({ supplierId: id, notes: notes.trim() || null, expectedAt: isoDay(expected), lines: parsedLines }));
    },
    onSuccess: async () => {
      setOrdering(false);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (orderId: string) => http.post(`/purchase-orders/${orderId}/cancel`),
    onSuccess: refresh,
  });
  const receive = useMutation({
    mutationFn: (locationId?: string) => http.post(`/purchase-orders/${receiving}/receive`, locationId ? { locationId } : {}),
    onSuccess: async () => {
      setReceiving(null);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
  const link = useMutation({
    mutationFn: (itemId: string) => http.patch(`/ingredients/${itemId}`, { supplierId: id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await refresh();
    },
  });
  const unlink = useMutation({
    mutationFn: (itemId: string) => http.patch(`/ingredients/${itemId}`, { supplierId: null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await refresh();
    },
  });
  const expense = useMutation({
    mutationFn: () => {
      const value = Number(expenseAmount.replace(",", "."));
      const label = (customCategory ? customLabel : category).trim();
      if (!Number.isFinite(value) || value <= 0) throw new Error("Scrivi un importo");
      if (label.length < 2) throw new Error("Scegli una voce");
      return http.post("/ledger", ledgerEntrySchema.parse({ kind: "EXPENSE", date: new Date().toISOString(), amount: value, category: label, description: expenseNote.trim() || null, paid, supplierId: id }));
    },
    onSuccess: async () => {
      setExpenseOpen(false);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
    },
  });

  function openEdit() {
    if (!supplier) return;
    setDraft(supplierDraft(supplier));
    setFormError(null);
    save.reset();
    setEditing(true);
  }

  function submitEdit() {
    const parsed = supplierSchema.safeParse(draft);
    if (!parsed.success) {
      setFormError(supplierIssue(parsed.error));
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  function openOrder(seed?: StockItem[]) {
    setLines(
      seed?.length
        ? seed.slice(0, 20).map((item) => ({
            key: item.id,
            ingredientId: item.id,
            description: item.name,
            quantity: String(reorderQty(item)),
            price: item.unitCost ? String(item.unitCost) : "",
          }))
        : [emptyLine()],
    );
    setNotes("");
    setExpected("");
    setPicking(null);
    order.reset();
    setOrdering(true);
  }

  function addArticles(items: StockItem[]) {
    setLines((current) => {
      const kept = current.filter((line) => line.description.trim() || line.quantity.trim());
      const seen = new Set(kept.map((line) => line.ingredientId).filter(Boolean));
      const next = items
        .filter((item) => !seen.has(item.id))
        .slice(0, 20)
        .map((item) => ({
          key: item.id,
          ingredientId: item.id,
          description: item.name,
          quantity: String(reorderQty(item)),
          price: item.unitCost ? String(item.unitCost) : "",
        }));
      return [...kept, ...next].slice(0, 20);
    });
  }

  function patchLine(key: string, patch: Partial<OrderLineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function openExpense() {
    expense.reset();
    setCategory(expensePresets[0] ?? "");
    setCustomCategory(expensePresets.length === 0);
    setCustomLabel("");
    setExpenseAmount("");
    setExpenseNote("");
    setPaid(true);
    setExpenseOpen(true);
  }

  const phone = supplier?.phone?.replace(/\s/g, "");
  const address = [supplier?.address, supplier?.city].filter(Boolean).join(", ");

  return (
    <Screen onBack={() => router.back()} backLabel="Fornitori" onRefresh={() => query.refetch()}>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {supplier ? (
          <>
            <Text variant="display">{supplier.name}</Text>
            <Text muted>{[supplier.contactName, address, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Anagrafica da completare"}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {phone ? <Button label="Chiama" tone="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${phone}`)} /> : null}
              {supplier.email ? <Button label="Email" tone="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`mailto:${supplier.email}`)} /> : null}
            </View>

            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Stat label="Aperti" value={String(openOrders.length)} />
                <Stat label="Da ricevere" value={euro(openOrders.reduce((sum, item) => sum + orderTotal(item.lines), 0))} />
                <Stat label={accounting ? "Da pagare" : "Ricevuto"} value={euro(accounting ? unpaid : (supplier.orders.filter((item) => item.status === "RECEIVED").reduce((sum, item) => sum + orderTotal(item.lines), 0)))} />
              </View>
            </Card>

            <Card style={{ gap: 12 }}>
              <Field label="Partita IVA" value={supplier.vat} />
              <Field label="Referente" value={supplier.contactName} />
              <Field label="Indirizzo" value={address} />
              <Field label="Pagamento" value={supplier.paymentTerms} />
              <Field label="Note" value={supplier.notes} />
              {!supplier.vat && !supplier.contactName && !address && !supplier.paymentTerms && !supplier.notes ? <Text muted>Aggiungi P. IVA, referente e come lo paghi.</Text> : null}
            </Card>
            {writable ? <Button label="Modifica" tone="secondary" onPress={openEdit} /> : null}

            <Text variant="title">Articoli</Text>
            <Text muted>Quello che compri di solito da qui. Sotto scorta si può rimettere in ordine.</Text>
            {low.length && writable ? <Button label={`Ordina sotto scorta (${low.length})`} onPress={() => openOrder(low)} /> : null}
            {articles.length ? (
              articles.map((item) => {
                const short = Boolean(stock.data) && item.minQuantity != null && item.minQuantity > 0 && item.quantity <= item.minQuantity;
                return (
                  <Card key={item.id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Text variant="heading" style={{ flex: 1 }}>
                        {item.name}
                      </Text>
                      {short ? <Badge label="Sotto scorta" tone="danger" /> : null}
                    </View>
                    <Text muted>
                      {stock.data ? `${qty(item.quantity)} ${item.unit}` : item.unit}
                      {item.unitCost ? ` · ${euro(item.unitCost)}/${item.unit}` : ""}
                      {item.minQuantity ? ` · minimo ${qty(item.minQuantity)}` : ""}
                    </Text>
                    {stockWrite ? (
                      <Text variant="caption" style={{ color: theme.colors.danger }} onPress={() => unlink.mutate(item.id)}>
                        Scollega
                      </Text>
                    ) : null}
                  </Card>
                );
              })
            ) : (
              <Text muted>Nessun articolo collegato.</Text>
            )}
            {stockWrite && unlinked.length ? <Button label="Collega articolo" tone="secondary" onPress={() => setLinking(true)} /> : null}
            {link.error || unlink.error ? <Text style={{ color: theme.colors.danger }}>{(link.error ?? unlink.error)?.message}</Text> : null}

            <Text variant="title">Ordini</Text>
            {writable ? <Button label="Nuovo ordine" onPress={() => openOrder()} /> : null}
            {cancel.error ? <Text style={{ color: theme.colors.danger }}>{cancel.error.message}</Text> : null}
            {supplier.orders.length ? (
              supplier.orders.map((item) => {
                const active = item.status === "DRAFT" || item.status === "SENT";
                return (
                  <Card key={item.id} style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Text variant="heading">{dayLabel(item.createdAt)}</Text>
                      <Badge label={STATUS_LABEL[item.status] ?? item.status} tone={orderTone(item.status)} />
                    </View>
                    {item.lines.map((line) => (
                      <Text key={line.id} muted>
                        {line.description} · {qty(line.quantity)}
                        {line.ingredient?.unit ? ` ${line.ingredient.unit}` : ""} × {euro(line.unitPrice)}
                      </Text>
                    ))}
                    <Text>Totale {euro(orderTotal(item.lines))}</Text>
                    {item.expectedAt && item.status !== "RECEIVED" ? <Text muted>Consegna {dayLabel(item.expectedAt)}</Text> : null}
                    {item.receivedAt ? <Text muted>Ricevuto {when(item.receivedAt)}</Text> : null}
                    {item.notes ? <Text muted>{item.notes}</Text> : null}
                    {active ? (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {canReceive ? <Button label="Ricevi" style={{ flex: 1 }} onPress={() => { receive.reset(); setReceiving(item.id); }} /> : null}
                        {writable ? (
                          <Button
                            label="Annulla"
                            tone="secondary"
                            style={{ flex: 1 }}
                            loading={cancel.isPending}
                            onPress={() =>
                              Alert.alert("Annullare l'ordine?", "La merce resta fuori dalle scorte.", [
                                { text: "No", style: "cancel" },
                                { text: "Annulla ordine", style: "destructive", onPress: () => cancel.mutate(item.id) },
                              ])
                            }
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            ) : (
              <Text muted>Nessun ordine ancora.</Text>
            )}

            {accounting ? (
              <>
                <Text variant="title">Spese</Text>
                {accountingWrite ? <Button label="Registra uscita" tone="secondary" onPress={openExpense} /> : null}
                {expenses.length ? (
                  expenses.map((entry) => (
                    <Card key={entry.id} style={{ gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <Text variant="heading" style={{ flex: 1 }}>
                          {entry.category}
                        </Text>
                        <Text variant="heading">{euro(entry.amount)}</Text>
                      </View>
                      <Text muted>
                        {dayLabel(entry.date)} · {entry.paid ? "Pagata" : "Da pagare"}
                      </Text>
                      {entry.description ? <Text muted>{entry.description}</Text> : null}
                    </Card>
                  ))
                ) : (
                  <Text muted>Nessuna spesa collegata.</Text>
                )}
              </>
            ) : null}

            {remove.error ? <Text style={{ color: theme.colors.danger }}>{remove.error.message}</Text> : null}
            {writable ? (
              <Button
                label="Elimina fornitore"
                tone="danger"
                loading={remove.isPending}
                onPress={() =>
                  Alert.alert(`Eliminare ${supplier.name}?`, "Se ha ordini, il fornitore resta in elenco.", [
                    { text: "Annulla", style: "cancel" },
                    { text: "Elimina", style: "destructive", onPress: () => remove.mutate() },
                  ])
                }
              />
            ) : null}
          </>
        ) : null}
      </QueryState>

      <Sheet visible={editing} title="Modifica fornitore" onClose={() => setEditing(false)}>
        <SupplierFields draft={draft} onChange={setDraft} nameError={formError?.includes("nome") ? formError : undefined} />
        {formError && !formError.includes("nome") ? <Text>{formError}</Text> : null}
        {save.error ? <Text>{save.error.message}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={submitEdit} />
      </Sheet>

      <Sheet visible={ordering} title="Nuovo ordine" onClose={() => setOrdering(false)}>
        {low.length ? <Button label={`Aggiungi sotto scorta (${low.length})`} tone="secondary" onPress={() => addArticles(low)} /> : null}
        {articles.length ? <Button label="Aggiungi gli articoli" tone="secondary" onPress={() => addArticles(articles)} /> : null}
        {lines.map((line, index) => (
          <View key={line.key} style={{ gap: 8 }}>
            <Text variant="label">Riga {index + 1}</Text>
            <Input label="Cosa ordini" value={line.description} onChangeText={(description) => patchLine(line.key, { description })} />
            <Input label="Quantità" keyboardType="decimal-pad" value={line.quantity} onChangeText={(quantity) => patchLine(line.key, { quantity })} />
            <Input label="Prezzo" keyboardType="decimal-pad" value={line.price} onChangeText={(price) => patchLine(line.key, { price })} />
            {line.ingredientId ? <Text variant="caption" muted>Entra in scorta alla ricezione e aggiorna il costo.</Text> : null}
            {catalog.length ? (
              <Chip label={picking === line.key ? "Chiudi scorte" : "Collega alle scorte"} active={picking === line.key} onPress={() => setPicking(picking === line.key ? null : line.key)} />
            ) : null}
            {picking === line.key ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {catalog.map((item) => (
                  <Chip
                    key={item.id}
                    label={item.name}
                    active={line.ingredientId === item.id}
                    onPress={() => {
                      patchLine(line.key, { ingredientId: item.id, description: line.description.trim() ? line.description : item.name, price: line.price.trim() ? line.price : item.unitCost ? String(item.unitCost) : "" });
                      setPicking(null);
                    }}
                  />
                ))}
              </View>
            ) : null}
            {lines.length > 1 ? (
              <Button label="Togli riga" tone="ghost" onPress={() => setLines((current) => current.filter((row) => row.key !== line.key))} />
            ) : null}
          </View>
        ))}
        {lines.length < 20 ? <Button label="Aggiungi riga" tone="secondary" onPress={() => setLines((current) => [...current, emptyLine()])} /> : null}
        <DateField label="Consegna prevista" value={expected} onChange={setExpected} minimumDate={new Date()} />
        <Input label="Note" value={notes} onChangeText={setNotes} multiline />
        {order.error ? <Text style={{ color: theme.colors.danger }}>{order.error.message}</Text> : null}
        <Button label="Crea ordine" loading={order.isPending} onPress={() => order.mutate()} />
      </Sheet>

      <Sheet visible={Boolean(receiving)} title="Ricevi ordine" onClose={() => setReceiving(null)}>
        <Text muted>
          {receivingOrder?.lines.some((line) => line.ingredientId)
            ? "Gli articoli collegati entrano in scorta e il costo si aggiorna."
            : "Questo ordine non ha articoli collegati: segni la consegna e la giacenza resta com'è."}
        </Text>
        <Button label="Ricevi nell'ubicazione principale" loading={receive.isPending} onPress={() => receive.mutate(undefined)} />
        {places.data?.map((place) => (
          <Button key={place.id} label={place.name} tone="secondary" loading={receive.isPending} onPress={() => receive.mutate(place.id)} />
        ))}
        {receive.error ? <Text style={{ color: theme.colors.danger }}>{receive.error.message}</Text> : null}
      </Sheet>

      <Sheet visible={linking} title="Collega articolo" onClose={() => setLinking(false)}>
        {unlinked.map((item) => (
          <Button
            key={item.id}
            label={item.supplier ? `${item.name} · ${item.supplier.name}` : item.name}
            tone="secondary"
            loading={link.isPending}
            onPress={() => {
              link.mutate(item.id, { onSuccess: () => setLinking(false) });
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={expenseOpen} title="Uscita" onClose={() => setExpenseOpen(false)}>
        <Input label="Importo" keyboardType="decimal-pad" value={expenseAmount} onChangeText={setExpenseAmount} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {expensePresets.map((label) => (
            <Chip key={label} label={label} active={!customCategory && category === label} onPress={() => { setCustomCategory(false); setCategory(label); }} />
          ))}
          <Chip label="Altro" active={customCategory} onPress={() => setCustomCategory(true)} />
        </View>
        {customCategory ? <Input label="Voce" value={customLabel} onChangeText={setCustomLabel} /> : null}
        <Input label="Nota" value={expenseNote} onChangeText={setExpenseNote} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Pagata" active={paid} onPress={() => setPaid(true)} />
          <Chip label="Da pagare" active={!paid} onPress={() => setPaid(false)} />
        </View>
        {expense.error ? <Text style={{ color: theme.colors.danger }}>{expense.error.message}</Text> : null}
        <Button label="Registra" loading={expense.isPending} onPress={() => expense.mutate()} />
      </Sheet>
    </Screen>
  );
}
