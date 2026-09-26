import { Ionicons } from "@expo/vector-icons";
import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { Badge, Card, Pressy, Text, useTheme, withAlpha, type Theme } from "@rapportini/ui";
import { STATUS_LABEL } from "../format";
import { CircleButton } from "./Hero";
import { addressLine, estimateLeg, formatDistance, formatDuration, openDirections, type Coords, type LegEstimate } from "../maps";

export interface WorkOrderRow {
  id: string;
  title: string;
  status: string;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  customer?: { name: string; address?: string | null; city?: string | null } | null;
  asset?: { name: string; location?: { name: string; address?: string | null; city?: string | null } | null } | null;
  assignee?: { id: string; name: string } | null;
}

export type Filter = "open" | "all" | "done";

export interface DayGroup {
  key: string;
  kind: "overdue" | "today" | "future" | "past" | "undated";
  label: string;
  caption?: string;
  orders: WorkOrderRow[];
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SCHEDULED: "accent",
  IN_PROGRESS: "warning",
  DONE: "success",
  CANCELLED: "danger",
};

const TIME_WIDTH = 50;
const RAIL_WIDTH = 24;
const DOT_TOP = 18;

export function isOpen(order: WorkOrderRow) {
  return order.status !== "DONE" && order.status !== "CANCELLED";
}

/** Dove si va davvero: la sede dell'impianto se c'è, altrimenti l'indirizzo del cliente. */
export function stopAddress(order: WorkOrderRow) {
  return addressLine(order.asset?.location) ?? addressLine(order.customer);
}

export function stopName(order: WorkOrderRow) {
  return order.customer?.name ?? order.asset?.location?.name ?? order.title;
}

export function toneColor(theme: Theme, tone: Tone) {
  if (tone === "accent") return theme.colors.accent;
  if (tone === "success") return theme.colors.success;
  if (tone === "warning") return theme.colors.warning;
  if (tone === "danger") return theme.colors.danger;
  return theme.colors.inkSoft;
}

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "accent";
}

export function clock(value: string) {
  return new Date(value).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function longDate(key: string, now: Date) {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", ...(year !== now.getFullYear() ? { year: "numeric" } : {}) });
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function byTime(a: WorkOrderRow, b: WorkOrderRow) {
  return new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();
}

export function groupByDay(orders: WorkOrderRow[], filter: Filter, now: Date): DayGroup[] {
  const today = dayKey(now);
  const relative: Record<string, string> = { [today]: "Oggi", [dayKey(shiftDays(now, 1))]: "Domani", [dayKey(shiftDays(now, -1))]: "Ieri" };
  const visible = orders.filter((order) => (filter === "open" ? isOpen(order) : filter === "done" ? order.status === "DONE" : true));
  const overdue: WorkOrderRow[] = [];
  const undated: WorkOrderRow[] = [];
  const days = new Map<string, WorkOrderRow[]>();
  for (const order of visible) {
    if (!order.scheduledAt) {
      undated.push(order);
      continue;
    }
    const key = dayKey(new Date(order.scheduledAt));
    if (key < today && isOpen(order)) {
      overdue.push(order);
      continue;
    }
    days.set(key, [...(days.get(key) ?? []), order]);
  }
  const day = (key: string): DayGroup => {
    const date = capitalize(longDate(key, now));
    return {
      key,
      kind: key === today ? "today" : key > today ? "future" : "past",
      label: relative[key] ?? date,
      caption: relative[key] ? date : undefined,
      orders: days.get(key)!.sort(byTime),
    };
  };
  const keys = [...days.keys()].sort();
  const groups: DayGroup[] = [];
  if (overdue.length) groups.push({ key: "overdue", kind: "overdue", label: "Da recuperare", caption: "Erano in programma nei giorni scorsi", orders: overdue.sort(byTime) });
  groups.push(...keys.filter((key) => key >= today).map(day));
  if (undated.length) groups.push({ key: "undated", kind: "undated", label: "Senza data", caption: "Da mettere in agenda", orders: undated });
  groups.push(...keys.filter((key) => key < today).reverse().map(day));
  return groups;
}

export function legBetween(from: WorkOrderRow, to: WorkOrderRow, coords: Map<string, Coords | null>) {
  const a = coords.get(stopAddress(from) ?? "");
  const b = coords.get(stopAddress(to) ?? "");
  const estimate = a && b ? estimateLeg(a, b) : null;
  let tight = false;
  if (estimate && from.scheduledAt && to.scheduledAt) {
    const freeAt = new Date(from.scheduledAt).getTime() + (from.durationMinutes ?? 0) * 60_000;
    tight = (new Date(to.scheduledAt).getTime() - freeAt) / 60_000 < estimate.minutes;
  }
  return { estimate, tight };
}

function Rail({ first, last, faint, children }: { first?: boolean; last?: boolean; faint?: boolean; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ width: RAIL_WIDTH, alignItems: "center" }}>
      <View
        style={{
          position: "absolute",
          width: 2,
          borderRadius: 1,
          top: first ? DOT_TOP : 0,
          bottom: last ? undefined : 0,
          height: last ? DOT_TOP : undefined,
          backgroundColor: faint ? withAlpha(theme.colors.inkSoft, 0.18) : withAlpha(theme.colors.inkSoft, 0.3),
        }}
      />
      {children}
    </View>
  );
}

function StatusDot({ status }: { status: string }) {
  const theme = useTheme();
  const color = toneColor(theme, statusTone(status));
  const filled = status === "DONE" || status === "IN_PROGRESS";
  return (
    <View
      style={{
        marginTop: DOT_TOP - 9,
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2.5,
        borderColor: color,
        backgroundColor: filled ? color : theme.colors.paperRaised,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: color,
        shadowOpacity: status === "IN_PROGRESS" ? 0.6 : 0,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      {status === "DONE" ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
      {status === "CANCELLED" ? <Ionicons name="close" size={11} color={color} /> : null}
    </View>
  );
}

export function NavigatePill({ onPress, label = "Naviga" }: { onPress: () => void; label?: string }) {
  const theme = useTheme();
  return (
    <Pressy
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.accentSoft,
      }}
    >
      <Ionicons name="navigate" size={13} color={theme.colors.accent} />
      <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressy>
  );
}

function TimelineRow({ order, first, last, overdue, onOpen }: { order: WorkOrderRow; first: boolean; last: boolean; overdue: boolean; onOpen: (id: string) => void }) {
  const theme = useTheme();
  const address = stopAddress(order);
  const cancelled = order.status === "CANCELLED";
  const where = [order.customer?.name, address].filter(Boolean).join(" · ");
  const date = order.scheduledAt ? new Date(order.scheduledAt) : null;
  const statusColor = overdue ? theme.colors.danger : toneColor(theme, statusTone(order.status));
  const status = [overdue ? "In ritardo" : (STATUS_LABEL[order.status] ?? order.status), order.assignee?.name].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ width: TIME_WIDTH, paddingTop: DOT_TOP - 10, alignItems: "flex-end", paddingRight: 4 }}>
        <Text variant="label" style={{ fontVariant: ["tabular-nums"], color: overdue ? theme.colors.danger : theme.colors.ink }}>
          {date ? clock(order.scheduledAt!) : "—"}
        </Text>
        {overdue && date ? (
          <Text variant="caption" muted>
            {date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
          </Text>
        ) : order.durationMinutes ? (
          <Text variant="caption" muted>
            {formatDuration(order.durationMinutes)}
          </Text>
        ) : null}
      </View>
      <Rail first={first} last={last}>
        <StatusDot status={order.status} />
      </Rail>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 10 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 0, opacity: cancelled ? 0.55 : 1 }}>
          <Pressy onPress={() => onOpen(order.id)} scaleTo={0.98} haptic="none" accessibilityRole="button" style={{ flex: 1, padding: 14, paddingRight: 0 }}>
            <View style={{ gap: 3 }}>
              <Text variant="heading" numberOfLines={2} style={{ textDecorationLine: cancelled ? "line-through" : "none" }}>
                {order.title}
              </Text>
              {where ? (
                <Text variant="caption" muted numberOfLines={1}>
                  {where}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
                <Text variant="caption" numberOfLines={1} style={{ color: statusColor, fontWeight: "700", flexShrink: 1 }}>
                  {status}
                </Text>
              </View>
            </View>
          </Pressy>
          <View style={{ paddingRight: 14 }}>
            {address && isOpen(order) ? <CircleButton icon="navigate" label={`Indicazioni per ${stopName(order)}`} onPress={() => openDirections([address], `Indicazioni per ${stopName(order)}`)} /> : null}
          </View>
        </Card>
      </View>
    </View>
  );
}

export function LegLink({ to, estimate, tight, label }: { to: WorkOrderRow; estimate: LegEstimate | null; tight: boolean; label?: string }) {
  const theme = useTheme();
  const address = stopAddress(to);
  if (!address) return null;
  const color = tight ? theme.colors.warning : theme.colors.inkSoft;
  return (
    <Pressy
      onPress={() => openDirections([address], `Vai a ${stopName(to)}`)}
      accessibilityRole="button"
      accessibilityLabel={`Indicazioni per ${stopName(to)}`}
      haptic="light"
      hitSlop={6}
      style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
    >
      <Ionicons name={tight ? "warning-outline" : "car-outline"} size={14} color={color} />
      <Text variant="caption" style={{ color, fontWeight: tight ? "700" : "400" }}>
        {estimate ? `${formatDuration(estimate.minutes)} · ${formatDistance(estimate.km)}${tight ? " · tempo stretto" : ""}` : (label ?? "Tragitto")}
      </Text>
      <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
        Indicazioni
      </Text>
    </Pressy>
  );
}

function LegRow({ from, to, coords }: { from: WorkOrderRow; to: WorkOrderRow; coords: Map<string, Coords | null> }) {
  const { estimate, tight } = legBetween(from, to, coords);
  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ width: TIME_WIDTH }} />
      <Rail faint />
      <View style={{ flex: 1, paddingBottom: 10 }}>
        <LegLink to={to} estimate={estimate} tight={tight} />
      </View>
    </View>
  );
}

function NowRow({ now }: { now: Date }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
      <View style={{ width: TIME_WIDTH, alignItems: "flex-end", paddingRight: 4 }}>
        <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
          {now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
      <View style={{ width: RAIL_WIDTH, alignItems: "center" }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent }} />
      </View>
      <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: theme.colors.accent }} />
      <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700", marginLeft: 8 }}>
        Adesso
      </Text>
    </View>
  );
}

export function TimelineDay({ group, now, coords, onOpen }: { group: DayGroup; now: Date; coords: Map<string, Coords | null>; onOpen: (id: string) => void }) {
  const theme = useTheme();
  const chained = group.kind === "today" || group.kind === "future" || group.kind === "past";
  const route = chained ? group.orders.filter((order) => isOpen(order) && stopAddress(order)) : [];
  const done = group.orders.filter((order) => order.status === "DONE").length;
  const nowIndex = group.kind === "today" ? group.orders.findIndex((order) => new Date(order.scheduledAt!).getTime() > now.getTime()) : -1;
  const count = `${group.orders.length} ${group.orders.length === 1 ? "intervento" : "interventi"}${chained && done ? ` · ${done} fatti` : ""}`;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="title" style={{ color: group.kind === "overdue" ? theme.colors.danger : theme.colors.ink }}>
            {group.label}
          </Text>
          <Text variant="caption" muted>
            {[group.caption, count].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {route.length > 1 ? (
          <Pressy
            onPress={() => openDirections(route.map((order) => stopAddress(order)!), `${group.label}: ${route.length} tappe`)}
            accessibilityRole="button"
            accessibilityLabel={`Percorso con ${route.length} tappe`}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <Ionicons name="git-network-outline" size={15} color={theme.colors.accent} />
            <Text variant="label" style={{ color: theme.colors.accent }}>
              Percorso
            </Text>
          </Pressy>
        ) : null}
      </View>
      <View>
        {group.orders.map((order, index) => {
          const next = group.orders[index + 1];
          const showLeg = chained && next && isOpen(next) && stopAddress(order) && stopAddress(next);
          return (
            <Fragment key={order.id}>
              {index === nowIndex ? <NowRow now={now} /> : null}
              <TimelineRow order={order} first={index === 0} last={!next} overdue={group.kind === "overdue"} onOpen={onOpen} />
              {showLeg ? <LegRow from={order} to={next} coords={coords} /> : null}
            </Fragment>
          );
        })}
        {group.kind === "today" && nowIndex === -1 && group.orders.length ? <View style={{ marginTop: 10 }}><NowRow now={now} /></View> : null}
      </View>
    </View>
  );
}
