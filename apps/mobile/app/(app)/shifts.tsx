import { shiftSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { RecordPicker } from "../../src/components/RecordPicker";
import { QueryState } from "../../src/components/States";
import { fromLocalInput, STATUS_LABEL, when } from "../../src/format";
import { useManifest } from "../../src/session";

interface Shift { id: string; roleLabel?: string | null; startsAt: string; endsAt: string; status: string; user: { id: string; name: string } }
interface Member { userId: string; name: string; roleName: string }

const STATUSES = [
  ["PLANNED", "Pianificato"],
  ["CONFIRMED", "Confermato"],
  ["DONE", "Fatto"],
  ["CANCELLED", "Annullato"],
] as const;

export default function ShiftsScreen() {
  const manifest = useManifest();
  const [open, setOpen] = useState(false);
  const [personQ, setPersonQ] = useState("");
  const [draft, setDraft] = useState({ userId: null as string | null, roleLabel: "", startsAt: "", endsAt: "", status: "" as "" | (typeof STATUSES)[number][0] });
  const query = useQuery({ queryKey: ["shifts"], queryFn: () => http.get<Shift[]>("/shifts") });
  const team = useQuery({ queryKey: ["team"], queryFn: () => http.get<{ members: Member[] }>("/team"), retry: false });
  const people = team.data?.members ?? (manifest.data ? [{ userId: manifest.data.user.id, name: manifest.data.user.name, roleName: manifest.data.role.name }] : []);
  const save = useMutation({
    mutationFn: () => {
      const startsAt = fromLocalInput(draft.startsAt);
      const endsAt = fromLocalInput(draft.endsAt);
      if (!draft.userId) throw new Error("Scegli la persona");
      if (!startsAt || !endsAt) throw new Error("Scrivi inizio e fine, per esempio 2026-09-26T18:00");
      return http.post("/shifts", shiftSchema.parse({ userId: draft.userId, roleLabel: draft.roleLabel || null, startsAt, endsAt, status: draft.status || undefined }));
    },
    onSuccess: async () => {
      setOpen(false);
      setDraft({ userId: null, roleLabel: "", startsAt: "", endsAt: "", status: "" });
      await queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });

  return (
    <Screen>
      <Text variant="display">Turni</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.map((shift) => (
          <Card key={shift.id} style={{ gap: 4 }}>
            <Text variant="heading">{shift.user.name}</Text>
            <Text muted>
              {shift.roleLabel} · {when(shift.startsAt)} – {when(shift.endsAt)} · {STATUS_LABEL[shift.status]}
            </Text>
          </Card>
        ))}
      </QueryState>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Nuovo turno" onClose={() => setOpen(false)}>
        <RecordPicker
          label="Persona"
          query={personQ}
          onQuery={setPersonQ}
          options={people.map((member) => ({ id: member.userId, title: member.name, subtitle: member.roleName }))}
          value={draft.userId}
          onChange={(userId) => setDraft({ ...draft, userId })}
          emptyLabel="Nessuno"
        />
        <Input label="Ruolo" value={draft.roleLabel} onChangeText={(roleLabel) => setDraft({ ...draft, roleLabel })} />
        <Input label="Inizio" value={draft.startsAt} onChangeText={(startsAt) => setDraft({ ...draft, startsAt })} />
        <Input label="Fine" value={draft.endsAt} onChangeText={(endsAt) => setDraft({ ...draft, endsAt })} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {STATUSES.map(([status, label]) => (
            <Chip key={status} label={label} active={draft.status === status} onPress={() => setDraft({ ...draft, status: draft.status === status ? "" : status })} />
          ))}
        </View>
        {save.error ? <Text>{save.error.message}</Text> : null}
        <Button label="Salva turno" loading={save.isPending} onPress={() => save.mutate()} />
      </Sheet>
    </Screen>
  );
}
