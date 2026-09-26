import { View } from "react-native";
import { Badge, Card, Pressy, Text, useTheme, withAlpha, type Theme } from "@rapportini/ui";
import { CircleButton } from "./Hero";
import { STATUS_LABEL } from "../format";
import {
  clock,
  crossesMidnight,
  dayKey,
  dayTitle,
  firstName,
  inMonth,
  monthCells,
  monthTitle,
  packLanes,
  sameDay,
  shiftsOnDay,
  sliceOnDay,
  startOfDay,
  timeWindow,
  weekDays,
  weekTitle,
  type ShiftItem,
  type ShiftView,
} from "../shifts";

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const LABEL_W = 48;

export function shiftColor(theme: Theme, people: { id: string }[], userId: string) {
  const colors = [theme.colors.accent, theme.colors.info, theme.colors.success, theme.colors.warning, theme.colors.accentAlt];
  const index = people.findIndex((person) => person.id === userId);
  return colors[(index < 0 ? 0 : index) % colors.length]!;
}

function dayCount(count: number) {
  if (count === 0) return "nessun turno";
  return count === 1 ? "1 turno" : `${count} turni`;
}

function CalendarNav({ title, showToday, onPrev, onNext, onToday }: { title: string; showToday: boolean; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <CircleButton icon="chevron-back" label="Periodo precedente" onPress={onPrev} tone="plain" />
        <Text variant="heading" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
          {title}
        </Text>
        <CircleButton icon="chevron-forward" label="Periodo successivo" onPress={onNext} tone="plain" />
      </View>
      {showToday ? (
        <Pressy onPress={onToday} accessibilityRole="button" accessibilityLabel="Torna a oggi" hitSlop={6} style={{ alignSelf: "center", paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text variant="label" style={{ color: theme.colors.accent }}>
            Oggi
          </Text>
        </Pressy>
      ) : null}
    </View>
  );
}

function MonthView({ day, shifts, people, onSelect }: { day: Date; shifts: ShiftItem[]; people: { id: string; name: string }[]; onSelect: (day: Date) => void }) {
  const theme = useTheme();
  const today = startOfDay(new Date());
  const cells = monthCells(day);
  const weeks: Date[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((label) => (
          <Text key={label} variant="caption" muted style={{ flex: 1, textAlign: "center", fontWeight: "700" }}>
            {label}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={dayKey(week[0]!)} style={{ flexDirection: "row" }}>
          {week.map((date) => {
            const active = sameDay(date, day);
            const todayCell = sameDay(date, today);
            const inside = inMonth(date, day);
            const onDay = shiftsOnDay(shifts, date);
            return (
              <Pressy
                key={dayKey(date)}
                onPress={() => onSelect(date)}
                accessibilityRole="button"
                accessibilityLabel={`${date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}, ${dayCount(onDay.length)}`}
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  minHeight: 52,
                  alignItems: "center",
                  paddingTop: 2,
                  paddingBottom: 4,
                  borderRadius: 14,
                  backgroundColor: active ? theme.colors.accentSoft : "transparent",
                  borderWidth: 1,
                  borderColor: active && !todayCell ? theme.colors.accent : "transparent",
                  opacity: inside ? 1 : 0.38,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: todayCell ? theme.colors.accent : "transparent",
                  }}
                >
                  <Text variant="label" style={{ color: todayCell ? theme.colors.accentInk : theme.colors.ink }}>
                    {date.getDate()}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 3, minHeight: 8, alignItems: "center" }}>
                  {[...new Set(onDay.map((shift) => shift.user.id))].slice(0, 4).map((userId) => (
                    <View key={userId} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: shiftColor(theme, people, userId) }} />
                  ))}
                </View>
              </Pressy>
            );
          })}
        </View>
      ))}
      {people.some((person) => shifts.some((shift) => shift.user.id === person.id)) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 4 }}>
          {people.filter((person) => shifts.some((shift) => shift.user.id === person.id)).slice(0, 8).map((person) => (
            <View key={person.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: shiftColor(theme, people, person.id) }} />
              <Text variant="caption" muted>
                {firstName(person.name)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function shortClock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = Math.round(minutes % 60);
  return minute === 0 ? String(hour) : `${hour}:${String(minute).padStart(2, "0")}`;
}

function WeekView({
  day,
  shifts,
  people,
  onSelect,
  onOpen,
}: {
  day: Date;
  shifts: ShiftItem[];
  people: { id: string; name: string }[];
  onSelect: (day: Date) => void;
  onOpen?: (shift: ShiftItem) => void;
}) {
  const theme = useTheme();
  const today = startOfDay(new Date());
  const days = weekDays(day);
  const hours = timeWindow(shifts, days);
  const span = hours.end - hours.start;
  const step = span > 12 * 60 ? 4 * 60 : 2 * 60;
  const marks: number[] = [];
  for (let minute = hours.start; minute < hours.end; minute += step) marks.push(minute);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 4, paddingRight: 2 }}>
        <View style={{ width: LABEL_W }} />
        <View style={{ flex: 1, height: 18 }}>
          {marks.map((minute) => (
            <Text key={minute} variant="caption" muted style={{ position: "absolute", left: `${((minute - hours.start) / span) * 100}%` }}>
              {Math.floor(minute / 60)}
            </Text>
          ))}
        </View>
      </View>
      {days.map((date) => {
        const active = sameDay(date, day);
        const onDay = shiftsOnDay(shifts, date);
        const early = onDay.filter((shift) => {
          const slice = sliceOnDay(shift, date);
          return Boolean(slice && new Date(shift.startsAt).getTime() < startOfDay(date).getTime() && slice.endMin <= hours.start);
        });
        const placed = packLanes(
          onDay.flatMap((shift) => {
            const slice = sliceOnDay(shift, date);
            if (!slice) return [];
            const startMin = Math.max(slice.startMin, hours.start);
            const endMin = Math.min(slice.endMin, hours.end);
            if (endMin - startMin < 1) return [];
            return [{ shift, startMin, endMin, clipped: startMin !== slice.startMin || endMin !== slice.endMin }];
          }),
        );
        const lanes = placed[0]?.lanes ?? 1;
        const height = placed.length === 0 ? 36 : lanes * 28 + 8;
        const showNow = sameDay(date, today) && nowMin >= hours.start && nowMin <= hours.end;
        return (
          <View
            key={dayKey(date)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 14,
              backgroundColor: active ? theme.colors.accentSoft : "transparent",
              paddingVertical: 2,
              paddingRight: 2,
            }}
          >
            <Pressy
              onPress={() => onSelect(date)}
              accessibilityRole="button"
              accessibilityLabel={`${date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" })}, ${dayCount(onDay.length)}`}
              accessibilityState={{ selected: active }}
              style={{ width: LABEL_W, alignItems: "center", justifyContent: "center", minHeight: height }}
            >
              <Text variant="caption" muted style={{ fontWeight: "700", textTransform: "capitalize" }}>
                {date.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}
              </Text>
              <Text variant="label" style={{ color: sameDay(date, today) ? theme.colors.accent : theme.colors.ink }}>
                {date.getDate()}
              </Text>
              {early[0] ? (
                <Text variant="caption" numberOfLines={1} style={{ fontSize: 10, lineHeight: 12, color: theme.colors.accent }}>
                  {clock(early[0].endsAt)}
                </Text>
              ) : null}
            </Pressy>
            <View style={{ flex: 1, height, borderRadius: 10, overflow: "hidden", backgroundColor: theme.colors.field }}>
              <Pressy onPress={() => onSelect(date)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
              {marks.map((minute) => (
                <View
                  key={minute}
                  pointerEvents="none"
                  style={{ position: "absolute", left: `${((minute - hours.start) / span) * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: theme.colors.line }}
                />
              ))}
              {placed.map(({ item, lane }) => {
                const width = Math.max((item.endMin - item.startMin) / span, 30 / span);
                const color = shiftColor(theme, people, item.shift.user.id);
                const wide = (item.endMin - item.startMin) / span >= 0.1;
                const cancelled = item.shift.status === "CANCELLED";
                return (
                  <Pressy
                    key={item.shift.id}
                    onPress={onOpen ? () => onOpen(item.shift) : undefined}
                    disabled={!onOpen}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.shift.user.name}, ${clock(item.shift.startsAt)}–${clock(item.shift.endsAt)}${item.shift.roleLabel ? `, ${item.shift.roleLabel}` : ""}`}
                    style={{
                      position: "absolute",
                      zIndex: 1,
                      left: `${((item.startMin - hours.start) / span) * 100}%`,
                      width: `${width * 100}%`,
                      top: 4 + lane * 28,
                      height: 24,
                      borderRadius: 8,
                      paddingHorizontal: 6,
                      justifyContent: "center",
                      overflow: "hidden",
                      backgroundColor: withAlpha(color, theme.dark ? 0.34 : 0.18),
                      borderLeftWidth: 3,
                      borderLeftColor: color,
                      opacity: cancelled ? 0.5 : item.shift.status === "DONE" ? 0.72 : 1,
                    }}
                  >
                    {wide ? (
                      <Text variant="caption" numberOfLines={1} style={{ fontWeight: "700", fontSize: 11, lineHeight: 14, textDecorationLine: cancelled ? "line-through" : "none" }}>
                        {item.clipped ? firstName(item.shift.user.name) : `${shortClock(item.startMin)}–${shortClock(item.endMin)} ${firstName(item.shift.user.name)}`}
                      </Text>
                    ) : null}
                  </Pressy>
                );
              })}
              {showNow ? (
                <View pointerEvents="none" style={{ position: "absolute", zIndex: 2, left: `${((nowMin - hours.start) / span) * 100}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: theme.colors.accent }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, marginLeft: -3, backgroundColor: theme.colors.accent }} />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ShiftCalendar({
  view,
  day,
  shifts,
  people,
  onSelect,
  onOpen,
  onPrev,
  onNext,
  onToday,
}: {
  view: ShiftView;
  day: Date;
  shifts: ShiftItem[];
  people: { id: string; name: string }[];
  onSelect: (day: Date) => void;
  onOpen?: (shift: ShiftItem) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const today = startOfDay(new Date());
  return (
    <Card style={{ gap: 12, padding: 12 }}>
      <CalendarNav title={view === "week" ? weekTitle(day) : monthTitle(day)} showToday={!sameDay(day, today)} onPrev={onPrev} onNext={onNext} onToday={onToday} />
      {view === "week" ? <WeekView day={day} shifts={shifts} people={people} onSelect={onSelect} onOpen={onOpen} /> : <MonthView day={day} shifts={shifts} people={people} onSelect={onSelect} />}
    </Card>
  );
}

function statusTone(status: string): "neutral" | "accent" | "success" | "danger" {
  if (status === "CONFIRMED") return "success";
  if (status === "CANCELLED") return "danger";
  if (status === "DONE") return "neutral";
  return "accent";
}

export function ShiftDayList({ day, shifts, people, onOpen }: { day: Date; shifts: ShiftItem[]; people: { id: string; name: string }[]; onOpen?: (shift: ShiftItem) => void }) {
  const theme = useTheme();
  const rows = shiftsOnDay(shifts, day);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
          {dayTitle(day)}
        </Text>
        {rows.length ? (
          <Text variant="caption" muted>
            {rows.length === 1 ? "1 turno" : `${rows.length} turni`}
          </Text>
        ) : null}
      </View>
      {rows.length === 0 ? (
        <Text muted>{onOpen ? "Nessun turno. Usa + per aggiungerne uno." : "Nessun turno in questo giorno."}</Text>
      ) : (
        rows.map((shift) => {
          const color = shiftColor(theme, people, shift.user.id);
          const cancelled = shift.status === "CANCELLED";
          const startedBefore = dayKey(new Date(shift.startsAt)) < dayKey(day);
          const note = [shift.roleLabel, startedBefore ? "iniziato ieri" : crossesMidnight(shift.startsAt, shift.endsAt) ? "finisce dopo mezzanotte" : null].filter(Boolean).join(" · ");
          const body = (
            <Card style={{ flexDirection: "row", gap: 12, opacity: cancelled ? 0.6 : 1 }}>
              <View style={{ width: 4, borderRadius: 4, backgroundColor: color }} />
              <View style={{ width: 58, justifyContent: "center" }}>
                <Text variant="heading">{clock(shift.startsAt)}</Text>
                <Text variant="caption" muted>
                  {clock(shift.endsAt)}
                </Text>
              </View>
              <View style={{ flex: 1, justifyContent: "center", gap: 2 }}>
                <Text variant="heading" numberOfLines={1} style={cancelled ? { textDecorationLine: "line-through" } : undefined}>
                  {shift.user.name}
                </Text>
                {note ? (
                  <Text variant="caption" muted numberOfLines={2}>
                    {note}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignSelf: "center" }}>
                <Badge label={STATUS_LABEL[shift.status] ?? shift.status} tone={statusTone(shift.status)} />
              </View>
            </Card>
          );
          if (!onOpen) return <View key={shift.id}>{body}</View>;
          return (
            <Pressy key={shift.id} onPress={() => onOpen(shift)} accessibilityRole="button" accessibilityLabel={`Modifica turno di ${shift.user.name}`} style={{ borderRadius: theme.radius.lg }}>
              {body}
            </Pressy>
          );
        })
      )}
    </View>
  );
}
