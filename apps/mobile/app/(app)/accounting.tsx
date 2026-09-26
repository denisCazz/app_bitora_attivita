import { isUsable, ledgerEntrySchema, ledgerSeriesId, type LedgerFlow, type LedgerReport } from "@rapportini/shared";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Fab, Input, ListItem, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Bars, ShareRows, TrendChart } from "../../src/components/Charts";
import { Chip } from "../../src/components/Chip";
import { QueryState } from "../../src/components/States";
import { euro } from "../../src/format";
import { can, useManifest, useVocab } from "../../src/session";

const PERIODS = [
  { days: 7, label: "7 giorni" },
  { days: 30, label: "30 giorni" },
  { days: 90, label: "3 mesi" },
] as const;

function italianDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, date ?? 1))
    .toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })
    .replace(".", "");
}

function whenDay(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function chipLabel(item: LedgerReport["categories"][number], categories: LedgerReport["categories"]) {
  const clash = categories.some((other) => other.category === item.category && other.kind !== item.kind);
  if (!clash) return item.category;
  return `${item.kind === "INCOME" ? "Entrate" : "Uscite"} · ${item.category}`;
}

function choicesFor(kind: LedgerFlow, presets: string[], categories: LedgerReport["categories"]) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const label of [...presets, ...categories.filter((item) => item.kind === kind).map((item) => item.category)]) {
    const key = label.toLocaleLowerCase("it");
    if (!label.trim() || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

export default function AccountingReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const manifest = useManifest();
  const ledger = useVocab().ledger;
  const writable = can(manifest.data, "accounting.write");
  const shiftsModule = manifest.data?.modules.find((item) => item.key === "shifts");
  const showPay = Boolean(shiftsModule && isUsable(shiftsModule.status) && can(manifest.data, "shifts.read"));
  const [days, setDays] = useState<(typeof PERIODS)[number]["days"]>(30);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LedgerFlow>("INCOME");
  const [category, setCategory] = useState("");
  const [custom, setCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ["ledger-report", days],
    queryFn: () => http.get<LedgerReport>(`/ledger/report?days=${days}`),
    placeholderData: keepPreviousData,
    enabled: Boolean(manifest.data),
  });

  useEffect(() => {
    setPicked(null);
  }, [days]);

  const categories = report.data?.categories ?? [];
  const selectedIds = picked ?? categories.filter((item) => item.amount > 0).map((item) => item.id);
  const selected = new Set(selectedIds);
  const visible = categories.filter((item) => selected.has(item.id));
  const incomeChoices = choicesFor("INCOME", ledger.income, categories);
  const expenseChoices = choicesFor("EXPENSE", ledger.expense, categories);
  const formChoices = kind === "INCOME" ? incomeChoices : expenseChoices;
  const allOn = categories.length > 0 && categories.every((item) => selected.has(item.id));
  const listed = (report.data?.entries ?? []).filter((entry) => selected.has(ledgerSeriesId(entry.kind, entry.category)));

  const save = useMutation({
    mutationFn: () => {
      const value = Number(amount.replace(",", "."));
      const label = (custom ? customLabel : category).trim();
      if (!Number.isFinite(value) || value <= 0) throw new Error("Scrivi un importo");
      if (label.length < 2) throw new Error("Scegli una categoria");
      return http.post("/ledger", ledgerEntrySchema.parse({ kind, date: new Date().toISOString(), amount: value, category: label, description: note.trim() || null, paid }));
    },
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
    },
  });

  function openForm() {
    save.reset();
    setKind("INCOME");
    setCategory(incomeChoices[0] ?? "");
    setCustom(false);
    setCustomLabel("");
    setAmount("");
    setNote("");
    setPaid(true);
    setFormError(null);
    setOpen(true);
  }

  function chooseKind(next: LedgerFlow) {
    setKind(next);
    setCustom(false);
    setCategory((next === "INCOME" ? incomeChoices : expenseChoices)[0] ?? "");
    setFormError(null);
  }

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked([...next]);
  }

  const data = report.data;
  const flowColor = (flow: LedgerFlow) => (flow === "INCOME" ? theme.colors.success : theme.colors.danger);

  return (
    <Screen onRefresh={() => report.refetch()}>
      <View style={{ gap: 4 }}>
        <Text variant="display">Report</Text>
        <Text muted>
          Entrate e uscite di {manifest.data?.tenant.name}, per le categorie di {manifest.data?.tenant.category.label.toLowerCase()}.
        </Text>
      </View>

      <Card>
        <ListItem title="Pagamenti" subtitle="Stato, link e QR per ogni intervento" onPress={() => router.push("/(app)/payments")} />
        {showPay ? <ListItem title="Dipendenti" subtitle="Stipendi calcolati dalle ore, già nelle uscite" onPress={() => router.push("/(app)/payroll")} /> : null}
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {PERIODS.map((period) => (
          <Chip key={period.days} label={period.label} active={days === period.days} onPress={() => setDays(period.days)} />
        ))}
      </View>

      <QueryState isLoading={report.isLoading} error={report.error} refetch={() => report.refetch()}>
        {data ? (
          <>
            <Text variant="caption" muted>
              {italianDay(data.from)} – {italianDay(data.to)}
            </Text>
            <Card style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" muted>
                  Entrate
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"], color: theme.colors.success }}>
                  {euro(data.income)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" muted>
                  Uscite
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"], color: theme.colors.danger }}>
                  {euro(data.expense)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" muted>
                  Saldo
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"], color: data.balance >= 0 ? theme.colors.success : theme.colors.danger }}>
                  {euro(data.balance)}
                </Text>
              </View>
            </Card>
            {data.toCollect > 0 || data.toPay > 0 || data.vatCollected > 0 || data.vatPaid > 0 ? (
              <Text variant="caption" muted>
                {[
                  data.toCollect > 0 ? `Ancora da incassare ${euro(data.toCollect)}` : "",
                  data.toPay > 0 ? `Ancora da pagare ${euro(data.toPay)}` : "",
                  data.vatCollected > 0 ? `IVA entrate ${euro(data.vatCollected)}` : "",
                  data.vatPaid > 0 ? `IVA uscite ${euro(data.vatPaid)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}

            <Card style={{ gap: 14 }}>
              <Text variant="heading">Andamento</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Legend color={theme.colors.success} label="Entrate" />
                <Legend color={theme.colors.danger} label="Uscite" />
              </View>
              {data.income === 0 && data.expense === 0 ? (
                <Text muted>Nessun movimento in questo periodo.</Text>
              ) : (
                <TrendChart points={data.trend} incomeColor={theme.colors.success} expenseColor={theme.colors.danger} />
              )}
              <Text variant="caption" muted>
                {data.grain === "week" ? "Ogni coppia di barre è una settimana." : "Ogni coppia di barre è un giorno."}
              </Text>
            </Card>

            <View style={{ gap: 8 }}>
              <Text variant="title">Categorie</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label="Tutte" active={allOn} onPress={() => setPicked(allOn ? [] : categories.map((item) => item.id))} />
                {categories.map((item) => (
                  <Chip
                    key={item.id}
                    label={chipLabel(item, categories)}
                    active={selected.has(item.id)}
                    tone={flowColor(item.kind)}
                    onPress={() => toggle(item.id)}
                  />
                ))}
              </View>
            </View>

            {visible.length === 0 ? (
              <Card>
                <Text muted>Scegli le categorie da vedere nel report. Quelle con movimenti in questo periodo sono già selezionate.</Text>
              </Card>
            ) : (
              <>
                {visible.some((item) => item.amount > 0) ? (
                  <Card style={{ gap: 14 }}>
                    <Text variant="heading">Confronto</Text>
                    <ShareRows
                      rows={visible
                        .filter((item) => item.amount > 0)
                        .map((item) => ({
                          id: item.id,
                          label: chipLabel(item, categories),
                          value: item.amount,
                          display: euro(item.amount),
                          color: flowColor(item.kind),
                        }))}
                    />
                  </Card>
                ) : null}
                {visible.map((item) => (
                  <Card key={item.id} style={{ gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Badge label={item.kind === "INCOME" ? "Entrata" : "Uscita"} tone={item.kind === "INCOME" ? "success" : "danger"} />
                        <Text variant="heading">{item.category}</Text>
                      </View>
                      <Text variant="title" style={{ fontVariant: ["tabular-nums"], color: flowColor(item.kind) }}>
                        {euro(item.amount)}
                      </Text>
                    </View>
                    <Text variant="caption" muted>
                      {item.count === 0 ? "Nessun movimento in questo periodo." : item.count === 1 ? "1 movimento" : `${item.count} movimenti`}
                    </Text>
                    {item.amount > 0 ? <Bars points={item.points} color={flowColor(item.kind)} /> : null}
                  </Card>
                ))}
              </>
            )}

            {listed.length ? (
              <View style={{ gap: 8 }}>
                <Text variant="title">Ultimi movimenti</Text>
                <Card style={{ paddingVertical: 4 }}>
                  {listed.map((entry, index) => (
                    <View
                      key={entry.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 12,
                        borderTopWidth: index ? 1 : 0,
                        borderTopColor: theme.colors.line,
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="heading" numberOfLines={1}>
                          {entry.category}
                        </Text>
                        <Text variant="caption" muted numberOfLines={1}>
                          {whenDay(entry.date)}
                          {entry.description ? ` · ${entry.description}` : ""}
                          {entry.paid ? "" : entry.kind === "INCOME" ? " · Da incassare" : " · Da pagare"}
                        </Text>
                      </View>
                      <Text variant="heading" style={{ fontVariant: ["tabular-nums"], color: flowColor(entry.kind) }}>
                        {entry.kind === "EXPENSE" ? "−" : ""}
                        {euro(entry.amount)}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        ) : null}
      </QueryState>

      {writable ? <Fab onPress={openForm} /> : null}
      <Sheet visible={open} title={kind === "INCOME" ? "Nuova entrata" : "Nuova uscita"} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Entrata" active={kind === "INCOME"} tone={theme.colors.success} onPress={() => chooseKind("INCOME")} />
          <Chip label="Uscita" active={kind === "EXPENSE"} tone={theme.colors.danger} onPress={() => chooseKind("EXPENSE")} />
        </View>
        <Input label="Importo" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {formChoices.map((label) => (
            <Chip
              key={label}
              label={label}
              active={!custom && category === label}
              tone={flowColor(kind)}
              onPress={() => {
                setCustom(false);
                setCategory(label);
              }}
            />
          ))}
          <Chip label="Altra voce" active={custom} onPress={() => setCustom(true)} />
        </View>
        {custom ? <Input label="Categoria" value={customLabel} onChangeText={setCustomLabel} placeholder="Es. Carburante" /> : null}
        <Input label="Nota" value={note} onChangeText={setNote} placeholder="Facoltativa" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label={kind === "INCOME" ? "Incassata" : "Pagata"} active={paid} onPress={() => setPaid(true)} />
          <Chip label={kind === "INCOME" ? "Da incassare" : "Da pagare"} active={!paid} onPress={() => setPaid(false)} />
        </View>
        {formError || save.error ? (
          <Text style={{ color: theme.colors.danger }}>{formError || (save.error instanceof Error ? save.error.message : "Non salvato")}</Text>
        ) : null}
        <Button
          label="Salva"
          loading={save.isPending}
          onPress={() => {
            setFormError(null);
            save.mutate(undefined, { onError: (error) => setFormError(error instanceof Error ? error.message : "Non salvato") });
          }}
        />
      </Sheet>
    </Screen>
  );
}
