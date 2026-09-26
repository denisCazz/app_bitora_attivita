import { shiftSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Card, Fab, Input, ListItem, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { RecordPicker } from "../../src/components/RecordPicker";
import { ShiftCalendar, ShiftDayList, shiftColor } from "../../src/components/ShiftCalendar";
import { QueryState } from "../../src/components/States";
import { can, useManifest } from "../../src/session";
import {
  addDays,
  composeShift,
  dayKey,
  fieldsFromShift,
  peopleOf,
  periodSummary,
  rangeFor,
  shiftMonth,
  startOfDay,
  type ShiftItem,
  type ShiftView,
} from "../../src/shifts";

const STATUSES = [
  ["PLANNED", "Pianificato"],
  ["CONFIRMED", "Confermato"],
  ["DONE", "Fatto"],
  ["CANCELLED", "Annullato"],
] as const;

type Status = (typeof STATUSES)[number][0];

interface Member {
  userId: string;
  name: string;
  roleName: string;
}

interface Draft {
  id?: string;
  userId: string | null;
  userName: string;
  roleLabel: string;
  day: string;
  start: string;
  end: string;
  status: Status;
}

function isStatus(value: string): value is Status {
  return STATUSES.some(([status]) => status === value);
}

function ViewSwitch({ value, onChange }: { value: ShiftView; onChange: (value: ShiftView) => void }) {
  const theme = useTheme();
  const options = [
    ["month", "Mese"],
    ["week", "Settimana"],
  ] as const;
  return (
    <View style={{ flexDirection: "row", padding: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.field, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
      {options.map(([key, label]) => {
        const active = value === key;
        return (
          <Pressy
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: active ? theme.colors.accentSoft : "transparent" }}
          >
            <Text variant="label" style={{ color: active ? theme.colors.accent : theme.colors.inkSoft }}>
              {label}
            </Text>
          </Pressy>
        );
      })}
    </View>
  );
}

export default function ShiftsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const manifest = useManifest();
  const writable = can(manifest.data, "shifts.write");
  const [view, setView] = useState<ShiftView>("month");
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [personQ, setPersonQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const range = rangeFor(view, day);
  const query = useQuery({
    queryKey: ["shifts", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => http.get<ShiftItem[]>(`/shifts?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`),
  });
  const team = useQuery({ queryKey: ["team"], queryFn: () => http.get<{ members: Member[] }>("/team"), retry: false });
  const teamPeople = team.data?.members ?? (manifest.data ? [{ userId: manifest.data.user.id, name: manifest.data.user.name, roleName: manifest.data.role.name }] : []);
  const people = useMemo(() => peopleOf(query.data ?? []), [query.data]);
  const shown = useMemo(() => (person ? (query.data ?? []).filter((shift) => shift.user.id === person.id) : (query.data ?? [])), [query.data, person]);
  const summary = periodSummary(shown, person?.name);
  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Niente da salvare");
      if (!draft.userId) throw new Error("Scegli la persona");
      const times = composeShift(draft.day, draft.start, draft.end);
      if (!times) throw new Error("Scrivi il giorno come 2026-09-26 e gli orari come 09:00");
      const body = shiftSchema.parse({
        userId: draft.userId,
        roleLabel: draft.roleLabel.trim() || null,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        status: draft.status,
      });
      if (draft.id) await http.patch(`/shifts/${draft.id}`, body);
      else await http.post("/shifts", body);
      return times.startsAt;
    },
    onSuccess: async (startsAt) => {
      setDraft(null);
      setDay(startOfDay(new Date(startsAt)));
      await queryClient.invalidateQueries({ queryKey: ["shifts"] });
      await queryClient.invalidateQueries({ queryKey: ["payroll"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
    },
  });

  function openCreate() {
    save.reset();
    setPersonQ("");
    setDraft({
      userId: person?.id ?? null,
      userName: person?.name ?? "",
      roleLabel: "",
      day: dayKey(day),
      start: "09:00",
      end: "17:00",
      status: "PLANNED",
    });
  }

  function openEdit(shift: ShiftItem) {
    save.reset();
    setPersonQ("");
    setDraft({
      id: shift.id,
      userId: shift.user.id,
      userName: shift.user.name,
      roleLabel: shift.roleLabel ?? "",
      ...fieldsFromShift(shift.startsAt, shift.endsAt),
      status: isStatus(shift.status) ? shift.status : "PLANNED",
    });
  }

  function move(delta: number) {
    setDay(view === "week" ? addDays(day, delta * 7) : shiftMonth(day, delta));
  }

  const options = teamPeople.map((member) => ({ id: member.userId, title: member.name, subtitle: member.roleName }));
  if (draft?.userId && draft.userName && !options.some((option) => option.id === draft.userId)) {
    options.unshift({ id: draft.userId, title: draft.userName, subtitle: "" });
  }
  const overnight = draft ? composeShift(draft.day, draft.start, draft.end)?.overnight : false;
  const filters = person && !people.some((item) => item.id === person.id) ? [person, ...people] : people;

  return (
    <Screen onRefresh={() => query.refetch()}>
      <View style={{ gap: 6 }}>
        <Text variant="display">Turni</Text>
        <Text muted>{query.isLoading ? "Carico i turni…" : query.data ? summary : " "}</Text>
      </View>
      <Card>
        <ListItem title="Dipendenti" subtitle="Paga oraria, straordinari e stipendio del mese" onPress={() => router.push("/(app)/payroll")} />
      </Card>
      <ViewSwitch value={view} onChange={setView} />
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {filters.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Tutti" active={!person} onPress={() => setPerson(null)} />
            {filters.map((item) => (
              <Chip
                key={item.id}
                label={item.name}
                tone={shiftColor(theme, people, item.id)}
                active={person?.id === item.id}
                onPress={() => setPerson(person?.id === item.id ? null : item)}
              />
            ))}
          </View>
        ) : null}
        <ShiftCalendar
          view={view}
          day={day}
          shifts={shown}
          people={people}
          onSelect={(next) => setDay(startOfDay(next))}
          onOpen={writable ? openEdit : undefined}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onToday={() => setDay(startOfDay(new Date()))}
        />
        <ShiftDayList day={day} shifts={shown} people={people} onOpen={writable ? openEdit : undefined} />
      </QueryState>
      {writable ? <Fab onPress={openCreate} /> : null}
      <Sheet visible={Boolean(draft)} title={draft?.id ? "Modifica turno" : "Nuovo turno"} onClose={() => setDraft(null)}>
        <RecordPicker
          label="Persona"
          query={personQ}
          onQuery={setPersonQ}
          options={options}
          value={draft?.userId ?? null}
          onChange={(userId) => {
            const chosen = options.find((option) => option.id === userId);
            setDraft((current) => (current ? { ...current, userId, userName: chosen?.title ?? "" } : current));
          }}
          emptyLabel="Nessuno"
        />
        <Input label="Ruolo" maxLength={40} value={draft?.roleLabel ?? ""} onChangeText={(roleLabel) => setDraft((current) => (current ? { ...current, roleLabel } : current))} placeholder="Sala, cucina…" />
        <Input
          label="Giorno"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
          placeholder="2026-09-26"
          value={draft?.day ?? ""}
          onChangeText={(value) => setDraft((current) => (current ? { ...current, day: value } : current))}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Dalle"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={5}
              placeholder="09:00"
              value={draft?.start ?? ""}
              onChangeText={(start) => setDraft((current) => (current ? { ...current, start } : current))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Alle"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={5}
              placeholder="17:00"
              value={draft?.end ?? ""}
              onChangeText={(end) => setDraft((current) => (current ? { ...current, end } : current))}
            />
          </View>
        </View>
        <Text variant="caption" muted>
          {overnight ? "Finisce il giorno dopo." : "Se la fine è prima dell'inizio, il turno chiude il giorno dopo."}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {STATUSES.map(([status, label]) => (
            <Chip key={status} label={label} active={draft?.status === status} onPress={() => setDraft((current) => (current ? { ...current, status } : current))} />
          ))}
        </View>
        {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error.message}</Text> : null}
        <Button label={draft?.id ? "Salva modifiche" : "Salva turno"} loading={save.isPending} onPress={() => save.mutate()} />
      </Sheet>
    </Screen>
  );
}
