import { addPayrollMonths, payRateSchema, payrollMonthLabel, payrollMonthOf, type PayrollLine } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, EmptyState, Input, ListItem, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";
import { euro } from "../../src/format";
import { goBack } from "../../src/navigation";
import { can, useManifest } from "../../src/session";

interface PayrollResponse {
  month: string;
  label: string;
  posted: boolean;
  ordinaryHours: number;
  overtimeHours: number;
  amount: number;
  lines: Array<PayrollLine & { ledgerEntryId: string | null; paid: boolean }>;
}

type Line = PayrollResponse["lines"][number];

function hours(value: number) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
}

function field(value: number | null) {
  if (value == null) return "";
  return String(value).replace(".", ",");
}

function parseNumber(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function worked(line: Line) {
  if (line.ordinaryHours === 0 && line.overtimeHours === 0) return "Nessuna ora in questo mese";
  const parts = [`${hours(line.ordinaryHours)} h`];
  if (line.overtimeHours > 0) parts.push(`${hours(line.overtimeHours)} h straordinarie`);
  return parts.join(" · ");
}

export default function PayrollScreen() {
  const theme = useTheme();
  const manifest = useManifest();
  const writable = can(manifest.data, "shifts.write");
  const [month, setMonth] = useState(() => payrollMonthOf(new Date()));
  const [edit, setEdit] = useState<Line | null>(null);
  const [hourly, setHourly] = useState("");
  const [overtime, setOvertime] = useState("");
  const [weekly, setWeekly] = useState("40");

  const payroll = useQuery({
    queryKey: ["payroll", month],
    queryFn: () => http.get<PayrollResponse>(`/payroll?month=${month}`),
  });

  const save = useMutation({
    mutationFn: async (clear: boolean) => {
      if (!edit) throw new Error("Niente da salvare");
      if (clear) {
        return http.patch<PayrollResponse>(`/payroll/${edit.userId}`, payRateSchema.parse({ hourlyRate: null, overtimeRate: null, weeklyHours: edit.weeklyHours, month }));
      }
      const hourlyRate = parseNumber(hourly);
      if (hourlyRate == null || hourlyRate <= 0) throw new Error("Scrivi la paga oraria");
      const overtimeRate = parseNumber(overtime);
      const weeklyHours = parseNumber(weekly);
      if (weeklyHours != null && (weeklyHours < 1 || weeklyHours > 80)) throw new Error("Le ore settimanali vanno da 1 a 80");
      return http.patch<PayrollResponse>(
        `/payroll/${edit.userId}`,
        payRateSchema.parse({ hourlyRate, overtimeRate: overtimeRate ?? hourlyRate, weeklyHours: weeklyHours ?? 40, month }),
      );
    },
    onSuccess: async (result) => {
      setEdit(null);
      queryClient.setQueryData(["payroll", month], result);
      await queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
    },
  });

  function open(line: Line) {
    save.reset();
    setHourly(field(line.hourlyRate));
    setOvertime(field(line.overtimeRate));
    setWeekly(field(line.weeklyHours));
    setEdit(line);
  }

  const data = payroll.data;
  const rawLabel = data?.label ?? payrollMonthLabel(month);
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  return (
    <Screen onBack={() => goBack("/(app)/shifts")} backLabel="Indietro" onRefresh={() => payroll.refetch()}>
      <View style={{ gap: 4 }}>
        <Text variant="display">Dipendenti</Text>
        <Text muted>Lo stipendio si calcola dalle ore dei turni. Con la paga impostata entra da solo nelle uscite.</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressy accessibilityRole="button" accessibilityLabel="Mese precedente" onPress={() => setMonth((current) => addPayrollMonths(current, -1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.ink} />
        </Pressy>
        <Text variant="heading">{label || "Mese"}</Text>
        <Pressy accessibilityRole="button" accessibilityLabel="Mese successivo" onPress={() => setMonth((current) => addPayrollMonths(current, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.ink} />
        </Pressy>
      </View>

      <QueryState isLoading={payroll.isLoading} error={payroll.error} refetch={() => payroll.refetch()}>
        {data ? (
          <>
            <Card style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" muted>
                  Ordinarie
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"] }}>
                  {hours(data.ordinaryHours)} h
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" muted>
                  Straordinari
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"] }}>
                  {hours(data.overtimeHours)} h
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" muted>
                  Stipendi
                </Text>
                <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"], color: theme.colors.danger }}>
                  {euro(data.amount)}
                </Text>
              </View>
            </Card>
            <Text variant="caption" muted>
              {data.amount <= 0
                ? "Quando ci sono ore e una paga, lo stipendio entra nelle uscite."
                : data.posted
                  ? "Già nelle uscite, voce Personale. Resta da pagare finché non lo segni nel report."
                  : "Attiva Contabilità per far entrare questi stipendi nelle uscite."}
            </Text>
            {data.lines.length ? (
              <Card>
                {data.lines.map((line) => (
                  <ListItem
                    key={line.userId}
                    title={line.name}
                    subtitle={[line.roleName, worked(line), line.hourlyRate == null ? "Paga non impostata" : `${euro(line.hourlyRate)}/h · straord. ${euro(line.overtimeRate ?? line.hourlyRate)}/h`, line.ledgerEntryId ? (line.paid ? "Pagato" : "Da pagare") : ""]
                      .filter(Boolean)
                      .join(" · ")}
                    trailing={
                      <Text variant="heading" style={{ fontVariant: ["tabular-nums"], color: line.amount > 0 ? theme.colors.danger : theme.colors.inkSoft }}>
                        {line.amount > 0 ? euro(line.amount) : "—"}
                      </Text>
                    }
                    onPress={writable ? () => open(line) : undefined}
                  />
                ))}
              </Card>
            ) : (
              <EmptyState title="Nessun dipendente" message="Invita le persone del negozio, poi assegna i turni. La paga si imposta da qui." />
            )}
            <Text variant="caption" muted>
              Contano le ore già fatte, fino a questo momento. I turni annullati no. Se segni un turno come fatto, conta per intero. Oltre le ore settimanali, da lunedì a domenica, scatta la paga straordinaria.
            </Text>
          </>
        ) : null}
      </QueryState>

      <Sheet visible={Boolean(edit)} title={edit ? `Paga di ${edit.name}` : "Paga"} onClose={() => setEdit(null)}>
        <Input label="Paga oraria" keyboardType="decimal-pad" value={hourly} onChangeText={setHourly} placeholder="10,00" />
        <Input label="Paga straordinaria" keyboardType="decimal-pad" value={overtime} onChangeText={setOvertime} placeholder="Uguale alla paga oraria" />
        <Input label="Ore ordinarie a settimana" keyboardType="decimal-pad" value={weekly} onChangeText={setWeekly} placeholder="40" />
        <Text variant="caption" muted>
          Nella settimana, da lunedì a domenica, le ore oltre questa soglia usano la paga straordinaria.
        </Text>
        {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error.message}</Text> : null}
        <Button label="Salva paga" loading={save.isPending} onPress={() => save.mutate(false)} />
        {edit?.hourlyRate != null ? <Button tone="secondary" label="Non calcolare lo stipendio" loading={save.isPending} onPress={() => save.mutate(true)} /> : null}
      </Sheet>
    </Screen>
  );
}
