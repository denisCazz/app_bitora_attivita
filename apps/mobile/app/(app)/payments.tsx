import {
  PAYMENT_PROVIDER_LABEL,
  PAYMENT_STATUS_LABEL,
  paymentPatchSchema,
  paymentWriteSchema,
  type PaymentProvider,
  type PaymentStatus,
} from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Badge, Button, Card, Fab, Input, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { API_URL, http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { QueryState } from "../../src/components/States";
import { euro } from "../../src/format";
import { can, useManifest } from "../../src/session";

interface PaymentRow {
  id: string;
  workOrderId: string;
  title: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  amount: number;
  paidAmount: number;
  remainder: number;
  status: PaymentStatus;
  method: string | null;
  note: string | null;
  provider: PaymentProvider | null;
  providerReady: boolean;
  payUrl: string;
  qrPath: string;
  message: string;
  whatsappHref: string | null;
  mailtoHref: string | null;
  sentEmailAt: string | null;
  sentWhatsappAt: string | null;
}

interface Candidate {
  id: string;
  title: string;
  status: string;
  customerName: string | null;
  paymentId: string | null;
}

const FILTERS = [
  { id: "open", label: "Da incassare" },
  { id: "paid", label: "Pagati" },
  { id: "all", label: "Tutti" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

function toneOf(status: PaymentStatus): "success" | "warning" | "neutral" {
  if (status === "PAID") return "success";
  if (status === "CANCELLED") return "neutral";
  return "warning";
}

function money(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function PaymentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const manifest = useManifest();
  const writable = can(manifest.data, "accounting.write");
  const manage = can(manifest.data, "settings.manage");
  const word = manifest.data?.tenant.terminology.workOrder?.toLowerCase() ?? "intervento";
  const params = useLocalSearchParams<{ workOrderId?: string }>();
  const focus = typeof params.workOrderId === "string" ? params.workOrderId : undefined;
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<string | null>(focus ?? null);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paidInput, setPaidInput] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("DUE");
  const [method, setMethod] = useState("Contanti");
  const [formError, setFormError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const list = useQuery({
    queryKey: ["payments"],
    queryFn: () => http.get<PaymentRow[]>("/payments"),
    enabled: Boolean(manifest.data),
  });

  const candidates = useQuery({
    queryKey: ["payment-work-orders", focus ?? ""],
    queryFn: () => http.get<Candidate[]>(`/payments/work-orders${focus ? `?workOrderId=${encodeURIComponent(focus)}` : ""}`),
    enabled: creating,
  });

  useEffect(() => {
    if (!focus || opened || !list.data) return;
    setOpened(true);
    const existing = list.data.find((row) => row.workOrderId === focus);
    if (existing) openRow(existing);
    else if (writable) {
      setPicked(focus);
      setAmount("");
      setNote("");
      setFormError(null);
      setCreating(true);
    }
  }, [focus, list.data, opened, writable]);

  function openRow(row: PaymentRow) {
    setSelected(row);
    setAmount(String(row.amount).replace(".", ","));
    setPaidInput(String(row.paidAmount).replace(".", ","));
    setStatus(row.status);
    setMethod(row.method ?? (row.provider ? PAYMENT_PROVIDER_LABEL[row.provider] : "Contanti"));
    setNote(row.note ?? "");
    setFormError(null);
  }

  const create = useMutation({
    mutationFn: () => {
      const value = money(amount);
      if (!picked) throw new Error(`Scegli un ${word}`);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Scrivi un importo");
      return http.post<PaymentRow>("/payments", paymentWriteSchema.parse({ workOrderId: picked, amount: value, note: note.trim() || null }));
    },
    onSuccess: async (row) => {
      setCreating(false);
      openRow(row);
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["payment-work-orders"] });
    },
  });

  const save = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Pagamento non trovato");
      const value = money(amount);
      const paid = money(paidInput);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Scrivi un importo");
      if (status === "PARTIAL" && (!Number.isFinite(paid) || paid <= 0)) throw new Error("Scrivi quanto è già stato incassato");
      return http.patch<PaymentRow>(
        `/payments/${selected.id}`,
        paymentPatchSchema.parse({
          amount: value,
          status,
          paidAmount: status === "PARTIAL" ? paid : undefined,
          method: method.trim() || null,
          note: note.trim() || null,
        }),
      );
    },
    onSuccess: async () => {
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
    },
  });

  const sent = useMutation({
    mutationFn: async (channel: "email" | "whatsapp") => {
      if (!selected) return;
      const href = channel === "email" ? selected.mailtoHref : selected.whatsappHref;
      if (!href) throw new Error(channel === "email" ? "Il cliente non ha un'email" : "Il cliente non ha un telefono");
      await Linking.openURL(href);
      await http.post(`/payments/${selected.id}/sent`, { channel });
    },
    onSuccess: (_data, channel) => {
      setSelected((row) =>
        row
          ? {
              ...row,
              sentEmailAt: channel === "email" ? new Date().toISOString() : row.sentEmailAt,
              sentWhatsappAt: channel === "whatsapp" ? new Date().toISOString() : row.sentWhatsappAt,
            }
          : row,
      );
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  const rows = (list.data ?? []).filter((row) => {
    if (filter === "open") return row.status === "DUE" || row.status === "PARTIAL";
    if (filter === "paid") return row.status === "PAID";
    return true;
  });
  const due = (list.data ?? []).filter((row) => row.status === "DUE" || row.status === "PARTIAL").reduce((sum, row) => sum + row.remainder, 0);
  const collected = (list.data ?? []).filter((row) => row.status !== "CANCELLED").reduce((sum, row) => sum + row.paidAmount, 0);
  const needle = query.trim().toLocaleLowerCase("it");
  const choices = (candidates.data ?? []).filter((row) => {
    if (!needle) return true;
    return `${row.title} ${row.customerName ?? ""}`.toLocaleLowerCase("it").includes(needle);
  });
  const methods = ["Contanti", "Bonifico", selected?.provider ? PAYMENT_PROVIDER_LABEL[selected.provider] : ""].filter((item, index, all) => item && all.indexOf(item) === index);

  return (
    <Screen onBack={() => router.back()} backLabel="Report" onRefresh={() => list.refetch()}>
      <View style={{ gap: 4 }}>
        <Text variant="display">Pagamenti</Text>
        <Text muted>Scegli un {word}, segna se è pagato e manda il link al cliente.</Text>
      </View>

      <Card style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" muted>
            Da incassare
          </Text>
          <Text variant="heading" style={{ fontVariant: ["tabular-nums"], color: theme.colors.warning }}>
            {euro(due)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" muted>
            Incassato
          </Text>
          <Text variant="heading" style={{ fontVariant: ["tabular-nums"], color: theme.colors.success }}>
            {euro(collected)}
          </Text>
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {FILTERS.map((item) => (
          <Chip key={item.id} label={item.label} active={filter === item.id} onPress={() => setFilter(item.id)} />
        ))}
      </View>

      <QueryState isLoading={list.isLoading} error={list.error} refetch={() => list.refetch()}>
        {rows.length === 0 ? (
          <Card>
            <Text muted>{filter === "open" ? `Nessun ${word} da incassare.` : "Nessun pagamento in questa vista."}</Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {rows.map((row, index) => (
              <Pressy key={row.id} onPress={() => openRow(row)} accessibilityRole="button" accessibilityLabel={`${row.title}, ${PAYMENT_STATUS_LABEL[row.status]}`}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: theme.colors.line,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {row.customer?.name ?? "Senza cliente"}
                      {row.method ? ` · ${row.method}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text variant="heading" style={{ fontVariant: ["tabular-nums"] }}>
                      {euro(row.status === "PAID" ? row.amount : row.remainder)}
                    </Text>
                    <Badge label={PAYMENT_STATUS_LABEL[row.status]} tone={toneOf(row.status)} />
                  </View>
                </View>
              </Pressy>
            ))}
          </Card>
        )}
      </QueryState>

      {writable ? (
        <Fab
          onPress={() => {
            create.reset();
            setPicked(null);
            setQuery("");
            setAmount("");
            setNote("");
            setFormError(null);
            setCreating(true);
          }}
        />
      ) : null}

      <Sheet visible={creating} title={`Nuovo pagamento`} onClose={() => setCreating(false)}>
        <Input label={`Cerca ${word}`} value={query} onChangeText={setQuery} placeholder="Titolo o cliente" />
        <View style={{ gap: 8 }}>
          {choices.slice(0, 8).map((row) => (
            <Chip
              key={row.id}
              label={`${row.title}${row.customerName ? ` · ${row.customerName}` : ""}${row.paymentId ? " · già aperto" : ""}`}
              active={picked === row.id}
              onPress={() => {
                if (row.paymentId) {
                  setCreating(false);
                  const existing = list.data?.find((item) => item.id === row.paymentId);
                  if (existing) openRow(existing);
                  return;
                }
                setPicked(row.id);
              }}
            />
          ))}
          {candidates.isLoading ? <Text muted>Cerco gli interventi…</Text> : null}
          {!candidates.isLoading && choices.length === 0 ? <Text muted>Nessun intervento trovato.</Text> : null}
        </View>
        <Input label="Importo" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <Input label="Nota per il cliente" value={note} onChangeText={setNote} placeholder="Facoltativa" />
        {formError || create.error ? (
          <Text style={{ color: theme.colors.danger }}>{formError || (create.error instanceof Error ? create.error.message : "Non salvato")}</Text>
        ) : null}
        <Button
          label="Crea"
          loading={create.isPending}
          onPress={() => {
            setFormError(null);
            create.mutate(undefined, { onError: (error) => setFormError(error instanceof Error ? error.message : "Non salvato") });
          }}
        />
      </Sheet>

      <Sheet visible={Boolean(selected)} title={selected?.title ?? "Pagamento"} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <Text muted>{selected.customer?.name ?? "Senza cliente"}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["DUE", "PARTIAL", "PAID", "CANCELLED"] as const).map((item) => (
                <Chip key={item} label={PAYMENT_STATUS_LABEL[item]} active={status === item} onPress={() => writable && setStatus(item)} />
              ))}
            </View>
            <Input label="Importo" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={writable} />
            {status === "PARTIAL" ? <Input label="Già incassato" value={paidInput} onChangeText={setPaidInput} keyboardType="decimal-pad" /> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {methods.map((item) => (
                <Chip key={item} label={item} active={method === item} onPress={() => setMethod(item)} />
              ))}
            </View>
            <Input label="Nota" value={note} onChangeText={setNote} placeholder="Facoltativa" />
            {selected.mailtoHref || selected.whatsappHref ? (
              <View style={{ gap: 8 }}>
                <Text variant="caption" muted>
                  {selected.provider && selected.providerReady ? `Link ${PAYMENT_PROVIDER_LABEL[selected.provider]}` : "Link con l'importo"}
                  {selected.sentWhatsappAt ? " · WhatsApp aperto" : ""}
                  {selected.sentEmailAt ? " · email aperta" : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {selected.whatsappHref ? (
                    <View style={{ flex: 1 }}>
                      <Button label="WhatsApp" tone="secondary" loading={sent.isPending} onPress={() => sent.mutate("whatsapp")} />
                    </View>
                  ) : null}
                  {selected.mailtoHref ? (
                    <View style={{ flex: 1 }}>
                      <Button label="Email" tone="secondary" loading={sent.isPending} onPress={() => sent.mutate("email")} />
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <Text muted>Aggiungi telefono o email del cliente per mandare il link.</Text>
            )}
            {!selected.providerReady ? (
              <Text muted>
                {manage ? "Per far pagare con carta, Revolut o Satispay, configura il metodo nelle impostazioni." : "Il metodo di pagamento non è ancora configurato."}
              </Text>
            ) : null}
            {manage ? (
              <Button
                label={selected.providerReady ? "Metodo di pagamento" : "Configura il metodo"}
                tone={selected.providerReady ? "ghost" : "secondary"}
                onPress={() => router.push("/(app)/settings/payments")}
              />
            ) : null}
            <Image source={{ uri: `${API_URL}${selected.qrPath}` }} style={{ width: 220, height: 220, alignSelf: "center" }} accessibilityLabel="QR del pagamento" />
            <Text variant="caption" muted style={{ textAlign: "center" }}>
              {selected.providerReady ? "Il cliente inquadra il QR e paga dalla pagina." : "Il QR apre la pagina con l'importo da pagare."}
            </Text>
            {formError || save.error || sent.error ? (
              <Text style={{ color: theme.colors.danger }}>
                {formError || (save.error instanceof Error ? save.error.message : sent.error instanceof Error ? sent.error.message : "Non salvato")}
              </Text>
            ) : null}
            {writable ? (
              <Button
                label="Salva incasso"
                loading={save.isPending}
                onPress={() => {
                  setFormError(null);
                  save.mutate(undefined, { onError: (error) => setFormError(error instanceof Error ? error.message : "Non salvato") });
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
