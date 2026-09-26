import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { EmptyState, Fab, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { DayRoute } from "../../../src/components/DayRoute";
import { Hero, HeroButton, HeroPill } from "../../../src/components/Hero";
import { QueryState } from "../../../src/components/States";
import { TimelineDay, clock, groupByDay, isOpen, stopAddress, stopName, type DayGroup, type Filter, type WorkOrderRow } from "../../../src/components/WorkOrderTimeline";
import { openDirections, useGeocoded, useLocationAccess } from "../../../src/maps";
import { useManifest } from "../../../src/session";

type Mode = "timeline" | "map";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "Da fare" },
  { key: "all", label: "Tutti" },
  { key: "done", label: "Fatti" },
];

const EMPTY: Record<Filter, { title: string; message: string }> = {
  open: { title: "Niente in sospeso", message: "Non ci sono interventi da fare. Crea il prossimo dal pulsante in basso." },
  all: { title: "Ancora nessun intervento", message: "Crea il primo intervento dal pulsante in basso." },
  done: { title: "Nessun intervento chiuso", message: "Qui trovi gli interventi completati." },
};

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function FilterTabs({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, flex: 1 }}>
      {FILTERS.map((item) => {
        const active = item.key === value;
        return (
          <Pressy
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: active ? theme.colors.ink : "transparent" }}
          >
            <Text variant="label" style={{ color: active ? theme.colors.paper : theme.colors.inkSoft }}>
              {item.label}
            </Text>
          </Pressy>
        );
      })}
    </View>
  );
}

function ModeToggle({ value, onChange }: { value: Mode; onChange: (value: Mode) => void }) {
  const theme = useTheme();
  const options: Array<{ key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: "timeline", label: "Timeline", icon: "list" },
    { key: "map", label: "Mappa", icon: "map" },
  ];
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: theme.radius.pill, backgroundColor: theme.colors.field, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressy
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            style={{ width: 40, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: active ? theme.colors.accent : "transparent" }}
          >
            <Ionicons name={option.icon} size={17} color={active ? "#fff" : theme.colors.inkSoft} />
          </Pressy>
        );
      })}
    </View>
  );
}

function NextHero({ today, upcoming, now, onOpen }: { today?: DayGroup; upcoming?: { group: DayGroup; order: WorkOrderRow }; now: Date; onOpen: (id: string) => void }) {
  const active = today?.orders.filter((order) => order.status !== "CANCELLED") ?? [];
  const done = active.filter((order) => order.status === "DONE").length;
  const focus = upcoming?.order;
  const address = focus ? stopAddress(focus) : null;
  const started = focus?.status === "IN_PROGRESS";
  const late = focus?.scheduledAt ? new Date(focus.scheduledAt).getTime() < now.getTime() && !started : false;
  const when = !focus
    ? ""
    : started
      ? "In corso adesso"
      : `${upcoming!.group.kind === "today" ? (late ? "In ritardo, era alle" : "Prossimo alle") : `${upcoming!.group.label} alle`} ${clock(focus.scheduledAt!)}`;

  return (
    <Hero>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <HeroPill icon="today-outline" label={today ? `Oggi · ${done} di ${active.length} ${active.length === 1 ? "fatto" : "fatti"}` : "Oggi niente in agenda"} />
        {active.length ? (
          <View style={{ flexDirection: "row", gap: 4 }}>
            {active.slice(0, 8).map((order) => (
              <View key={order.id} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: order.status === "DONE" ? "#fff" : "rgba(255,255,255,0.35)" }} />
            ))}
          </View>
        ) : null}
      </View>
      {focus ? (
        <Pressy onPress={() => onOpen(focus.id)} scaleTo={0.98} haptic="none" accessibilityRole="button" style={{ gap: 4 }}>
          <Text variant="label" style={{ color: "rgba(255,255,255,0.82)" }}>
            {when}
          </Text>
          <Text variant="title" numberOfLines={2} style={{ color: "#fff" }}>
            {focus.title}
          </Text>
          <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.88)" }}>
            {[stopName(focus), address].filter(Boolean).join(" · ")}
          </Text>
        </Pressy>
      ) : (
        <Text variant="title" style={{ color: "#fff" }}>
          Tutto fatto per ora
        </Text>
      )}
      {focus ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {address ? <HeroButton icon="navigate" label="Naviga" onPress={() => openDirections([address], `Indicazioni per ${stopName(focus)}`)} /> : null}
          <HeroButton tone={address ? "clear" : "solid"} icon={address ? undefined : "arrow-forward"} label="Apri" onPress={() => onOpen(focus.id)} />
        </View>
      ) : null}
    </Hero>
  );
}

export default function WorkOrdersScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const title = manifest.data?.tenant.terminology.workOrders ?? "Interventi";
  const [mode, setMode] = useState<Mode>("timeline");
  const [filter, setFilter] = useState<Filter>("open");
  const [mapDay, setMapDay] = useState<string | null>(null);
  const now = useNow();
  const access = useLocationAccess();
  const query = useQuery({ queryKey: ["work-orders"], queryFn: () => http.get<WorkOrderRow[]>("/work-orders") });

  const groups = useMemo(() => groupByDay(query.data ?? [], filter, now), [query.data, filter, now]);
  const everything = useMemo(() => groupByDay(query.data ?? [], "all", now), [query.data, now]);
  const today = everything.find((group) => group.kind === "today");
  const upcoming = useMemo(() => {
    for (const group of everything.filter((item) => item.kind === "today" || item.kind === "future")) {
      const started = group.orders.find((order) => order.status === "IN_PROGRESS");
      const next = started ?? group.orders.find(isOpen);
      if (next) return { group, order: next };
    }
    return undefined;
  }, [everything]);
  const openCount = (query.data ?? []).filter(isOpen).length;
  const overdue = everything.find((group) => group.kind === "overdue")?.orders.length ?? 0;

  const addresses = (list?: DayGroup) => (list?.orders ?? []).map(stopAddress).filter((address): address is string => Boolean(address));
  const todayCoords = useGeocoded(addresses(today), access.canGeocode);
  const cachedCoords = useGeocoded(groups.flatMap((group) => addresses(group)), false);
  const coords = new Map([...cachedCoords.coords, ...todayCoords.coords]);

  const open = (id: string) => router.push(`/(app)/work-orders/${id}`);

  return (
    <Screen onRefresh={() => query.refetch()}>
      <View style={{ gap: 2 }}>
        <Text variant="display">{title}</Text>
        {query.data ? (
          <Text muted>
            {[openCount ? `${openCount} da fare` : "Niente da fare", overdue ? `${overdue} in ritardo` : null].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      {upcoming || today ? <NextHero today={today} upcoming={upcoming} now={now} onOpen={open} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {mode === "timeline" ? (
          <FilterTabs value={filter} onChange={setFilter} />
        ) : (
          <Text variant="title" style={{ flex: 1 }}>
            Giro del giorno
          </Text>
        )}
        <ModeToggle value={mode} onChange={setMode} />
      </View>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {mode === "map" ? (
          <DayRoute groups={everything} dayKey={mapDay} onDay={setMapDay} onOpen={open} />
        ) : groups.length ? (
          <View style={{ gap: 28 }}>
            {groups.map((group) => (
              <TimelineDay key={group.key} group={group} now={now} coords={coords} onOpen={open} />
            ))}
          </View>
        ) : (
          <EmptyState title={EMPTY[filter].title} message={EMPTY[filter].message} />
        )}
      </QueryState>
      <Fab onPress={() => router.push("/(app)/work-orders/new")} />
    </Screen>
  );
}
