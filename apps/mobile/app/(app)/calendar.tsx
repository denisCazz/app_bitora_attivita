import { scheduleSchema, slotMinutes } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { Badge, Button, Card, EmptyState, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { DateField } from "../../src/components/DateField";
import { RecordPicker } from "../../src/components/RecordPicker";
import { QueryState } from "../../src/components/States";
import { fromLocalInput, toLocalInput, when } from "../../src/format";
import { useCanUse, useManifest, useVocab, vocabLabel } from "../../src/session";

interface ScheduleItem {
  id: string;
  title: string;
  dueAt: string;
  durationMinutes?: number | null;
  kind: string;
  intervalMonths?: number | null;
  asset?: { id: string; name: string } | null;
}

interface Draft {
  id?: string;
  title: string;
  dueAt: string;
  minutes: string;
  interval: string;
  kind: string;
  assetId: string | null;
  assetName: string;
}

interface Overlap {
  title: string;
  start: string;
  end: string;
}

function clock(value: string) {
  return new Date(value).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function slotLabel(dueAt: string, minutes: number) {
  const end = new Date(new Date(dueAt).getTime() + minutes * 60_000).toISOString();
  return `${when(dueAt)}–${clock(end)}`;
}

const blank = (): Draft => ({ title: "", dueAt: "", minutes: "", interval: "", kind: "", assetId: null, assetName: "" });

export default function CalendarScreen() {
  const manifest = useManifest();
  const { scheduleKinds } = useVocab();
  const assetsOn = useCanUse("assets");
  const [assetQ, setAssetQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const query = useQuery({
    queryKey: ["schedules"],
    queryFn: () => http.get<ScheduleItem[]>("/schedules"),
  });
  const assets = useQuery({
    queryKey: ["assets", assetQ],
    queryFn: () => http.get<Array<{ id: string; name: string; customer?: { name: string } | null }>>(`/assets?q=${encodeURIComponent(assetQ)}`),
    enabled: Boolean(draft) && assetsOn,
  });
  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("Niente da salvare");
      const dueAt = fromLocalInput(draft.dueAt);
      if (!draft.kind) throw new Error("Scegli il tipo");
      if (!dueAt) throw new Error("Scegli la data");
      const minutes = draft.minutes.trim() ? Number(draft.minutes) : null;
      if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 5 && minutes <= 720)) throw new Error("La durata va da 5 a 720 minuti");
      const body = scheduleSchema.parse({
        assetId: draft.assetId,
        kind: draft.kind,
        title: draft.title,
        dueAt,
        durationMinutes: minutes ?? (draft.id ? null : undefined),
        intervalMonths: draft.interval.trim() ? Number(draft.interval) : null,
      });
      return draft.id ? http.patch<{ overlaps?: Overlap[] }>(`/schedules/${draft.id}`, body) : http.post<{ overlaps?: Overlap[] }>("/schedules", body);
    },
    onSuccess: async (saved) => {
      setDraft(null);
      if (saved.overlaps?.length) {
        Alert.alert(
          "Salvato, ma si sovrappone",
          saved.overlaps.map((item) => `${item.title} · ${clock(item.start)}–${clock(item.end)}`).join("\n"),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["asset"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/schedules/${id}`),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      await queryClient.invalidateQueries({ queryKey: ["asset"] });
    },
  });

  function openCreate() {
    save.reset();
    remove.reset();
    setAssetQ("");
    setDraft(blank());
  }

  function openEdit(item: ScheduleItem) {
    save.reset();
    remove.reset();
    setAssetQ("");
    setDraft({
      id: item.id,
      title: item.title,
      dueAt: toLocalInput(item.dueAt),
      minutes: item.durationMinutes ? String(item.durationMinutes) : "",
      interval: item.intervalMonths ? String(item.intervalMonths) : "",
      kind: item.kind,
      assetId: item.asset?.id ?? null,
      assetName: item.asset?.name ?? "",
    });
  }

  const assetOptions = (assets.data ?? []).map((asset) => ({ id: asset.id, title: asset.name, subtitle: asset.customer?.name }));
  if (draft?.assetId && draft.assetName && !assetOptions.some((option) => option.id === draft.assetId)) {
    assetOptions.unshift({ id: draft.assetId, title: draft.assetName, subtitle: undefined });
  }

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">Calendario</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((item) => (
            <Card key={item.id} style={{ gap: 8 }}>
              <Badge label={vocabLabel(scheduleKinds, item.kind)} tone={scheduleKinds.find((kind) => kind.key === item.kind)?.tone ?? "accent"} />
              <Text variant="heading">{item.title}</Text>
              <Text muted>
                {[item.asset?.name, slotLabel(item.dueAt, item.durationMinutes ?? slotMinutes(scheduleKinds, item.kind)), item.intervalMonths ? `ogni ${item.intervalMonths} mesi` : null].filter(Boolean).join(" · ")}
              </Text>
              <Button label="Modifica" tone="secondary" onPress={() => openEdit(item)} />
            </Card>
          ))
        ) : (
          <EmptyState title="Nessuna scadenza" message="Aggiungi una scadenza con il pulsante +." />
        )}
      </QueryState>
      <Fab onPress={openCreate} />
      <Sheet
        visible={Boolean(draft)}
        title={draft?.id ? "Modifica scadenza" : "Nuova scadenza"}
        onClose={() => {
          setDraft(null);
          save.reset();
          remove.reset();
        }}
      >
        <Input label="Titolo" value={draft?.title ?? ""} onChangeText={(title) => setDraft((current) => (current ? { ...current, title } : current))} />
        <DateField label="Quando" mode="datetime" value={draft?.dueAt ?? ""} onChange={(dueAt) => setDraft((current) => (current ? { ...current, dueAt } : current))} />
        <Input
          label="Durata (minuti)"
          keyboardType="number-pad"
          placeholder={draft?.kind ? `${slotMinutes(scheduleKinds, draft.kind)} predefiniti` : "Predefinita in base al tipo"}
          value={draft?.minutes ?? ""}
          onChangeText={(minutes) => setDraft((current) => (current ? { ...current, minutes } : current))}
        />
        <Input
          label="Ogni quanti mesi"
          keyboardType="number-pad"
          value={draft?.interval ?? ""}
          onChangeText={(interval) => setDraft((current) => (current ? { ...current, interval } : current))}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {scheduleKinds.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              active={draft?.kind === key}
              onPress={() => setDraft((current) => (current ? { ...current, kind: current.kind === key ? "" : key } : current))}
            />
          ))}
        </View>
        {assetsOn ? (
          <RecordPicker
            label={manifest.data?.tenant.terminology.asset ?? "Impianto"}
            query={assetQ}
            onQuery={setAssetQ}
            options={assetOptions}
            value={draft?.assetId ?? null}
            onChange={(assetId) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      assetId,
                      assetName: assetOptions.find((option) => option.id === assetId)?.title ?? "",
                    }
                  : current,
              )
            }
          />
        ) : null}
        {save.error ? <Text>{save.error.message}</Text> : null}
        {remove.error ? <Text>{remove.error.message}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
        {draft?.id ? <Button label="Elimina" tone="danger" loading={remove.isPending} onPress={() => remove.mutate(draft.id!)} /> : null}
      </Sheet>
    </Screen>
  );
}
