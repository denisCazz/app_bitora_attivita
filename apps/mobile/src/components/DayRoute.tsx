import { Ionicons } from "@expo/vector-icons";
import { Fragment, useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import { Button, Card, EmptyState, Pressy, Text, useTheme, withAlpha } from "@rapportini/ui";
import { formatDistance, formatDuration, openDirections, useGeocoded, useLocationAccess } from "../maps";
import { Chip } from "./Chip";
import { RouteMap, mapAvailable, type MapStop } from "./RouteMap";
import { LegLink, clock, isOpen, legBetween, stopAddress, stopName, type DayGroup, type WorkOrderRow } from "./WorkOrderTimeline";

export function routeDays(groups: DayGroup[]) {
  return groups.filter((group) => group.kind !== "overdue" && group.kind !== "undated" && group.orders.some((order) => order.status !== "CANCELLED" && stopAddress(order)));
}

function StopBubble({ number, done, active }: { number: number; done: boolean; active: boolean }) {
  const theme = useTheme();
  const color = done ? theme.colors.success : theme.colors.accent;
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active || done ? color : withAlpha(color, 0.14),
        borderWidth: 2,
        borderColor: color,
      }}
    >
      {done ? (
        <Ionicons name="checkmark" size={16} color="#fff" />
      ) : (
        <Text variant="label" style={{ color: active ? "#fff" : color }}>
          {number}
        </Text>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

export function DayRoute({
  groups,
  dayKey,
  onDay,
  onOpen,
}: {
  groups: DayGroup[];
  dayKey: string | null;
  onDay: (key: string) => void;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  const access = useLocationAccess();
  const [focused, setFocused] = useState<string | null>(null);
  const days = routeDays(groups);
  const day = days.find((group) => group.key === dayKey) ?? days.find((group) => group.kind === "today" || group.kind === "future") ?? days[0];
  const stops = (day?.orders ?? []).filter((order) => order.status !== "CANCELLED" && stopAddress(order));
  const remaining = stops.filter(isOpen);
  const { coords, loading } = useGeocoded(stops.map((order) => stopAddress(order)!), access.canGeocode);

  const { request } = access;
  useEffect(() => {
    void request();
  }, [request]);

  if (!day) {
    return <EmptyState title="Niente da mostrare sulla mappa" message="Aggiungi l'indirizzo nella scheda del cliente o nella sede dell'impianto per vedere il giro sulla mappa." />;
  }

  const mapStops: MapStop[] = stops.flatMap((order, index) => {
    const point = coords.get(stopAddress(order)!);
    return point ? [{ id: order.id, number: index + 1, title: stopName(order), subtitle: order.title, coords: point, done: order.status === "DONE" }] : [];
  });
  const legs = stops.slice(1).map((order, index) => legBetween(stops[index]!, order, coords));
  const km = legs.reduce((sum, leg) => sum + (leg.estimate?.km ?? 0), 0);
  const minutes = legs.reduce((sum, leg) => sum + (leg.estimate?.minutes ?? 0), 0);
  const tight = legs.filter((leg) => leg.tight).length;
  const missing = stops.filter((order) => coords.get(stopAddress(order)!) === null);
  const noAddress = day.orders.filter((order) => order.status !== "CANCELLED" && !stopAddress(order));
  const needsPermission = Platform.OS === "android" && access.granted === false;

  return (
    <View style={{ gap: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((group) => (
          <Chip key={group.key} label={`${group.label} · ${group.orders.length}`} active={group.key === day.key} onPress={() => onDay(group.key)} />
        ))}
      </ScrollView>

      {mapAvailable ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <RouteMap stops={mapStops} showUser={access.granted === true} onSelect={setFocused} style={{ height: 320 }} />
          {loading || needsPermission ? (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 10,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.glassSolid,
              }}
            >
              {loading ? <ActivityIndicator color={theme.colors.accent} /> : <Ionicons name="location-outline" size={16} color={theme.colors.ink} />}
              <Text variant="caption" style={{ flex: 1 }}>
                {loading ? "Cerco gli indirizzi sulla mappa…" : "Consenti la posizione per vedere le tappe sulla mappa."}
              </Text>
              {needsPermission ? (
                <Pressy onPress={() => void request()} accessibilityRole="button">
                  <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
                    Consenti
                  </Text>
                </Pressy>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <RouteMap stops={mapStops} showUser={false} />
        </Card>
      )}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stat value={String(stops.length)} label={stops.length === 1 ? "tappa" : "tappe"} />
          <Stat value={km ? formatDistance(km) : "—"} label="tra le tappe" />
          <Stat value={minutes ? formatDuration(minutes) : "—"} label="di guida" />
        </View>
        {tight ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="warning-outline" size={14} color={theme.colors.warning} />
            <Text variant="caption" style={{ color: theme.colors.warning, flex: 1 }}>
              {tight === 1 ? "Un trasferimento sembra più lungo del tempo libero tra due interventi." : `${tight} trasferimenti sembrano più lunghi del tempo libero tra gli interventi.`}
            </Text>
          </View>
        ) : null}
        {remaining.length ? (
          <Button
            label={remaining.length > 1 ? `Avvia percorso completo · ${remaining.length} tappe` : "Naviga verso la prossima tappa"}
            onPress={() => openDirections(remaining.map((order) => stopAddress(order)!), `${day.label}: ${remaining.length} tappe`)}
          />
        ) : (
          <Text muted style={{ textAlign: "center" }}>
            Tutte le tappe di questo giorno sono completate.
          </Text>
        )}
        {km ? (
          <Text variant="caption" muted>
            Distanze e tempi sono stime: il navigatore calcola quelli reali con il traffico.
          </Text>
        ) : null}
      </Card>

      <Card style={{ gap: 0 }}>
        <Text variant="heading" style={{ marginBottom: 12 }}>
          Tappa per tappa
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 30, alignItems: "center" }}>
            <Ionicons name="locate" size={20} color={theme.colors.accent} />
          </View>
          <Text variant="label">La tua posizione</Text>
        </View>
        {stops.map((order: WorkOrderRow, index) => {
          const leg = index > 0 ? legs[index - 1]! : null;
          const done = order.status === "DONE";
          const active = focused === order.id;
          return (
            <Fragment key={order.id}>
              <View style={{ flexDirection: "row", gap: 12, minHeight: 40 }}>
                <View style={{ width: 30, alignItems: "center" }}>
                  <View style={{ width: 2, flex: 1, backgroundColor: withAlpha(theme.colors.inkSoft, 0.25) }} />
                </View>
                <View style={{ flex: 1, justifyContent: "center", paddingVertical: 8 }}>
                  {done ? null : <LegLink to={order} estimate={leg?.estimate ?? null} tight={leg?.tight ?? false} label={index === 0 ? "Da dove sei" : "Tragitto"} />}
                </View>
              </View>
              <Pressy onPress={() => onOpen(order.id)} scaleTo={0.98} haptic="none" accessibilityRole="button" style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <StopBubble number={index + 1} done={done} active={active} />
                <View style={{ flex: 1, gap: 2, opacity: done ? 0.6 : 1 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {stopName(order)}
                  </Text>
                  <Text variant="caption" muted numberOfLines={1}>
                    {[order.scheduledAt ? clock(order.scheduledAt) : null, order.title].filter(Boolean).join(" · ")}
                  </Text>
                  <Text variant="caption" numberOfLines={2}>
                    {stopAddress(order)}
                  </Text>
                </View>
                <Text muted style={{ fontSize: 20 }}>
                  ›
                </Text>
              </Pressy>
            </Fragment>
          );
        })}
      </Card>

      {missing.length || noAddress.length ? (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
            <Text variant="label">Da sistemare</Text>
          </View>
          {missing.map((order) => (
            <Text key={order.id} variant="caption" muted>
              {stopName(order)}: indirizzo non trovato sulla mappa ({stopAddress(order)})
            </Text>
          ))}
          {noAddress.map((order) => (
            <Text key={order.id} variant="caption" muted>
              {order.title}: manca l'indirizzo, non è nel percorso
            </Text>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
