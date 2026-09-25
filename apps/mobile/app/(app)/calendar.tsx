import { scheduleSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, EmptyState, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { RecordPicker } from "../../src/components/RecordPicker";
import { QueryState } from "../../src/components/States";
import { fromLocalInput, toLocalInput, when } from "../../src/format";
import { useCanUse, useManifest } from "../../src/session";

const KINDS = [
  ["ANNUAL_CLEANING", "Pulizia"],
  ["FLUE_CHECK", "Fumi"],
  ["HACCP", "HACCP"],
  ["GENERIC", "Generico"],
] as const;

type Kind = (typeof KINDS)[number][0];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS);

interface ScheduleItem {
  id: string;
  title: string;
  dueAt: string;
  kind: string;
  intervalMonths?: number | null;
  asset?: { id: string; name: string } | null;
}

interface Draft {
  id?: string;
  title: string;
  dueAt: string;
  interval: string;
  kind: "" | Kind;
  assetId: string | null;
  assetName: string;
}

const blank = (): Draft => ({ title: "", dueAt: "", interval: "", kind: "", assetId: null, assetName: "" });

function isKind(value: string): value is Kind {
  return KINDS.some(([kind]) => kind === value);
}

export default function CalendarScreen() {
  const manifest = useManifest();
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
      if (!dueAt) throw new Error("Scrivi la data, per esempio 2026-09-26T09:00");
      const body = scheduleSchema.parse({
        assetId: draft.assetId,
        kind: draft.kind,
        title: draft.title,
        dueAt,
        intervalMonths: draft.interval.trim() ? Number(draft.interval) : null,
      });
      return draft.id ? http.patch(`/schedules/${draft.id}`, body) : http.post("/schedules", body);
    },
    onSuccess: async () => {
      setDraft(null);
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
      interval: item.intervalMonths ? String(item.intervalMonths) : "",
      kind: isKind(item.kind) ? item.kind : "",
      assetId: item.asset?.id ?? null,
      assetName: item.asset?.name ?? "",
    });
  }

  const assetOptions = (assets.data ?? []).map((asset) => ({ id: asset.id, title: asset.name, subtitle: asset.customer?.name }));
  if (draft?.assetId && draft.assetName && !assetOptions.some((option) => option.id === draft.assetId)) {
    assetOptions.unshift({ id: draft.assetId, title: draft.assetName, subtitle: undefined });
  }

  return (
    <Screen>
      <Text variant="display">Calendario</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((item) => (
            <Card key={item.id} style={{ gap: 8 }}>
              <Badge label={KIND_LABEL[item.kind] ?? item.kind} tone={item.kind === "HACCP" ? "warning" : "accent"} />
              <Text variant="heading">{item.title}</Text>
              <Text muted>
                {[item.asset?.name, when(item.dueAt), item.intervalMonths ? `ogni ${item.intervalMonths} mesi` : null].filter(Boolean).join(" · ")}
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
        <Input label="Quando" value={draft?.dueAt ?? ""} onChangeText={(dueAt) => setDraft((current) => (current ? { ...current, dueAt } : current))} />
        <Input
          label="Ogni quanti mesi"
          keyboardType="number-pad"
          value={draft?.interval ?? ""}
          onChangeText={(interval) => setDraft((current) => (current ? { ...current, interval } : current))}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {KINDS.map(([kind, label]) => (
            <Chip
              key={kind}
              label={label}
              active={draft?.kind === kind}
              onPress={() => setDraft((current) => (current ? { ...current, kind: current.kind === kind ? "" : kind } : current))}
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
