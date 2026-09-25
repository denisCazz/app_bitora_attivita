import { scheduleSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Input, ListItem, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { RecordPicker } from "../../../src/components/RecordPicker";
import { QueryState } from "../../../src/components/States";
import { fromLocalInput, STATUS_LABEL, toLocalInput, when } from "../../../src/format";
import { useManifest, useVocab } from "../../../src/session";

interface AssetDetail {
  id: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  type?: string | null;
  customFields?: Record<string, unknown> | null;
  installedAt?: string | null;
  notes?: string | null;
  customer?: { id: string; name: string } | null;
  workOrders: Array<{ id: string; title: string; status: string }>;
  schedules: Array<{ id: string; title: string; dueAt: string; kind: string; intervalMonths?: number | null }>;
}

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const manifest = useManifest();
  const fields = (manifest.data?.customFields ?? []).filter((field) => field.entity === "ASSET");
  const [editing, setEditing] = useState(false);
  const [customerQ, setCustomerQ] = useState("");
  const [draft, setDraft] = useState({ name: "", type: "", brand: "", model: "", serialNumber: "", notes: "", installedAt: "", customerId: null as string | null });
  const { scheduleKinds } = useVocab();
  const [plan, setPlan] = useState({ title: "", dueAt: "", interval: "", kind: "" });
  const [planEdit, setPlanEdit] = useState<null | { id: string; title: string; dueAt: string; interval: string; kind: string }>(null);
  const query = useQuery({ queryKey: ["asset", id], queryFn: () => http.get<AssetDetail>(`/assets/${id}`) });
  const customers = useQuery({
    queryKey: ["customers", customerQ],
    queryFn: () => http.get<Array<{ id: string; name: string; city?: string | null }>>(`/customers?q=${encodeURIComponent(customerQ)}`),
    enabled: editing,
  });
  const save = useMutation({
    mutationFn: () => {
      const installedAt = fromLocalInput(draft.installedAt);
      if (draft.installedAt.trim() && !installedAt) throw new Error("Data installazione non valida");
      return http.patch(`/assets/${id}`, { ...draft, customerId: draft.customerId, installedAt });
    },
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["asset", id] });
    },
  });
  const schedule = useMutation({
    mutationFn: () => {
      const dueAt = fromLocalInput(plan.dueAt);
      if (!plan.kind) throw new Error("Scegli il tipo");
      if (!dueAt) throw new Error("Scrivi la data, per esempio 2026-09-26T09:00");
      return http.post("/schedules", scheduleSchema.parse({ assetId: id, kind: plan.kind, title: plan.title, dueAt, intervalMonths: plan.interval.trim() ? Number(plan.interval) : null }));
    },
    onSuccess: () => {
      setPlan({ title: "", dueAt: "", interval: "", kind: "" });
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
  const updateSchedule = useMutation({
    mutationFn: () => {
      if (!planEdit) throw new Error("Niente da salvare");
      const dueAt = fromLocalInput(planEdit.dueAt);
      if (!planEdit.kind) throw new Error("Scegli il tipo");
      if (!dueAt) throw new Error("Scrivi la data, per esempio 2026-09-26T09:00");
      return http.patch(
        `/schedules/${planEdit.id}`,
        scheduleSchema.parse({ assetId: id, kind: planEdit.kind, title: planEdit.title, dueAt, intervalMonths: planEdit.interval.trim() ? Number(planEdit.interval) : null }),
      );
    },
    onSuccess: () => {
      setPlanEdit(null);
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  return (
    <Screen onBack={() => router.back()}>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data ? (
          <>
            <Text variant="display">{query.data.name}</Text>
            <Text muted>
              {[query.data.type, query.data.brand, query.data.model, query.data.serialNumber].filter(Boolean).join(" · ")}
            </Text>
            <Text muted>{query.data.customer?.name}</Text>
            {query.data.notes ? <Text>{query.data.notes}</Text> : null}
            <Button
              label="Modifica"
              tone="secondary"
              onPress={() => {
                setDraft({
                  name: query.data?.name ?? "",
                  type: query.data?.type ?? "",
                  brand: query.data?.brand ?? "",
                  model: query.data?.model ?? "",
                  serialNumber: query.data?.serialNumber ?? "",
                  notes: query.data?.notes ?? "",
                  installedAt: toLocalInput(query.data?.installedAt),
                  customerId: query.data?.customer?.id ?? null,
                });
                setEditing(true);
              }}
            />
            {fields.some((field) => query.data?.customFields?.[field.key]) ? (
              <Card style={{ gap: 6 }}>
                {fields.map((field) =>
                  query.data?.customFields?.[field.key] ? (
                    <Text key={field.key}>
                      <Text muted>{field.label}: </Text>
                      {String(query.data.customFields[field.key])}
                    </Text>
                  ) : null,
                )}
              </Card>
            ) : null}
            <Text variant="title">Programmazione</Text>
            {query.data.schedules.map((item) => (
              <Card key={item.id} style={{ gap: 8 }}>
                <Text variant="heading">{item.title}</Text>
                <Text muted>{when(item.dueAt)}</Text>
                <Button
                  label="Modifica"
                  tone="secondary"
                  onPress={() => {
                    updateSchedule.reset();
                    setPlanEdit({
                      id: item.id,
                      title: item.title,
                      dueAt: toLocalInput(item.dueAt),
                      interval: item.intervalMonths ? String(item.intervalMonths) : "",
                      kind: item.kind,
                    });
                  }}
                />
              </Card>
            ))}
            <Card style={{ gap: 8 }}>
              <Text variant="heading">Nuova scadenza</Text>
              <Input label="Titolo" value={plan.title} onChangeText={(title) => setPlan({ ...plan, title })} />
              <Input label="Quando" value={plan.dueAt} onChangeText={(dueAt) => setPlan({ ...plan, dueAt })} />
              <Input label="Ogni quanti mesi" keyboardType="number-pad" value={plan.interval} onChangeText={(interval) => setPlan({ ...plan, interval })} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {scheduleKinds.map(({ key, label }) => (
                  <Chip key={key} label={label} active={plan.kind === key} onPress={() => setPlan({ ...plan, kind: plan.kind === key ? "" : key })} />
                ))}
              </View>
              {schedule.error ? <Text>{schedule.error.message}</Text> : null}
              <Button label="Salva scadenza" tone="secondary" loading={schedule.isPending} onPress={() => schedule.mutate()} />
            </Card>
            <Sheet visible={Boolean(planEdit)} title="Modifica scadenza" onClose={() => setPlanEdit(null)}>
              <Input label="Titolo" value={planEdit?.title ?? ""} onChangeText={(title) => setPlanEdit((current) => (current ? { ...current, title } : current))} />
              <Input label="Quando" value={planEdit?.dueAt ?? ""} onChangeText={(dueAt) => setPlanEdit((current) => (current ? { ...current, dueAt } : current))} />
              <Input
                label="Ogni quanti mesi"
                keyboardType="number-pad"
                value={planEdit?.interval ?? ""}
                onChangeText={(interval) => setPlanEdit((current) => (current ? { ...current, interval } : current))}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {scheduleKinds.map(({ key, label }) => (
                  <Chip
                    key={key}
                    label={label}
                    active={planEdit?.kind === key}
                    onPress={() => setPlanEdit((current) => (current ? { ...current, kind: current.kind === key ? "" : key } : current))}
                  />
                ))}
              </View>
              {updateSchedule.error ? <Text>{updateSchedule.error.message}</Text> : null}
              <Button label="Salva" loading={updateSchedule.isPending} onPress={() => updateSchedule.mutate()} />
            </Sheet>
            <Sheet visible={editing} title="Modifica scheda" onClose={() => setEditing(false)}>
              <Input label="Nome" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
              <Input label="Tipo" value={draft.type} onChangeText={(type) => setDraft({ ...draft, type })} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(manifest.data?.tenant.assetTypes ?? []).map((type) => (
                  <Chip key={type} label={type} active={draft.type === type} onPress={() => setDraft({ ...draft, type: draft.type === type ? "" : type })} />
                ))}
              </View>
              <Input label="Marca" value={draft.brand} onChangeText={(brand) => setDraft({ ...draft, brand })} />
              <Input label="Modello" value={draft.model} onChangeText={(model) => setDraft({ ...draft, model })} />
              <Input label="Matricola" value={draft.serialNumber} onChangeText={(serialNumber) => setDraft({ ...draft, serialNumber })} />
              <Input label="Installato il" value={draft.installedAt} onChangeText={(installedAt) => setDraft({ ...draft, installedAt })} />
              <Input label="Note" value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline />
              <RecordPicker
                label={manifest.data?.tenant.terminology.customer ?? "Cliente"}
                query={customerQ}
                onQuery={setCustomerQ}
                options={(customers.data ?? []).map((customer) => ({ id: customer.id, title: customer.name, subtitle: customer.city ?? undefined }))}
                value={draft.customerId}
                onChange={(customerId) => setDraft({ ...draft, customerId })}
              />
              {save.error ? <Text>{save.error.message}</Text> : null}
              <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
            </Sheet>
            <Text variant="title">Storico</Text>
            {query.data.workOrders.map((order) => (
              <Card key={order.id}>
                <ListItem title={order.title} subtitle={STATUS_LABEL[order.status]} onPress={() => router.push(`/(app)/work-orders/${order.id}`)} />
              </Card>
            ))}
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}
