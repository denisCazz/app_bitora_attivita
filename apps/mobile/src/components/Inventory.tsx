import { daysLeft, stockLevel, type InventoryMove, type StockLevel } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { Pressy, Text, useTheme, withAlpha } from "@rapportini/ui";
import { euro } from "../format";
import { Hero, HeroButton, HeroPill } from "./Hero";

type IconName = keyof typeof Ionicons.glyphMap;

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  sku: string | null;
  category: string | null;
  barcode: string | null;
  minQuantity: number | null;
  unitCost: number | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  quantity: number;
  byLocation: Array<{ locationId: string; name: string; quantity: number }>;
  usedLast30: number;
  lastMovementAt: string | null;
}

export interface InventoryMovement {
  id: string;
  quantity: number;
  reason: string | null;
  location: string;
  createdAt: string;
}

export function formatQty(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

export function parseQty(text: string) {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : NaN;
}

export function levelOf(item: InventoryItem): StockLevel {
  return stockLevel(item.quantity, item.minQuantity);
}

export function useLevelColor() {
  const theme = useTheme();
  return (level: StockLevel) => (level === "out" ? theme.colors.danger : level === "low" ? theme.colors.warning : theme.colors.success);
}

const LEVEL_ICON: Record<StockLevel, IconName> = { out: "alert-circle", low: "trending-down", ok: "checkmark-circle" };

export function LevelBar({ quantity, minQuantity, color }: { quantity: number; minQuantity: number; color: string }) {
  const theme = useTheme();
  const ratio = Math.max(0, Math.min(quantity / (minQuantity * 2), 1));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.field, overflow: "hidden" }}>
      <View style={{ width: `${ratio * 100}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
      <View style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: theme.colors.paper, opacity: 0.9 }} />
    </View>
  );
}

function detailLine(item: InventoryItem) {
  const left = daysLeft(item.quantity, item.usedLast30);
  return [
    item.minQuantity != null && item.minQuantity > 0 ? `Min ${formatQty(item.minQuantity)}` : "",
    item.supplier?.name ?? "",
    left != null && left > 0 && left <= 60 ? `Finisce in ~${left} ${left === 1 ? "giorno" : "giorni"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ItemRow({ item, first, onPress }: { item: InventoryItem; first: boolean; onPress: () => void }) {
  const theme = useTheme();
  const colorOf = useLevelColor();
  const level = levelOf(item);
  const color = colorOf(level);
  const detail = detailLine(item);
  const hasMin = item.minQuantity != null && item.minQuantity > 0;
  return (
    <Pressy
      onPress={onPress}
      scaleTo={0.98}
      haptic="none"
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatQty(item.quantity)} ${item.unit}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: theme.colors.line }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 13, borderCurve: "continuous", backgroundColor: withAlpha(color, theme.dark ? 0.24 : 0.14), alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={LEVEL_ICON[level]} size={20} color={color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
            {item.name}
          </Text>
          <Text variant="heading" style={{ fontVariant: ["tabular-nums"], color: level === "ok" ? theme.colors.ink : color }}>
            {formatQty(Math.max(item.quantity, 0))}
            <Text variant="caption" muted>
              {` ${item.unit}`}
            </Text>
          </Text>
        </View>
        {hasMin ? <LevelBar quantity={item.quantity} minQuantity={item.minQuantity!} color={color} /> : null}
        {detail ? (
          <Text variant="caption" muted numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressy>
  );
}

export function StockHero({
  total,
  low,
  out,
  value,
  onReorder,
  onCount,
}: {
  total: number;
  low: number;
  out: number;
  value: number;
  onReorder?: () => void;
  onCount?: () => void;
}) {
  const theme = useTheme();
  const toOrder = low + out;
  const ok = Math.max(total - toOrder, 0);
  const segments = [
    { key: "ok", count: ok, color: "#fff" },
    { key: "low", count: low, color: theme.colors.warning },
    { key: "out", count: out, color: theme.colors.danger },
  ].filter((segment) => segment.count > 0);
  return (
    <Hero>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <HeroPill icon="layers-outline" label={total === 1 ? "1 articolo" : `${total} articoli`} />
        {value > 0 ? <HeroPill icon="wallet-outline" label={`Valore ${euro(value)}`} /> : null}
      </View>
      <Text variant="title" style={{ color: "#fff" }}>
        {toOrder ? (toOrder === 1 ? "1 articolo da riordinare" : `${toOrder} articoli da riordinare`) : "Scorte in ordine"}
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.88)" }}>
        {toOrder ? [out ? `${out} ${out === 1 ? "esaurito" : "esauriti"}` : "", low ? `${low} sotto scorta` : ""].filter(Boolean).join(" · ") : "Niente sotto la scorta minima."}
      </Text>
      {total > 0 ? (
        <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2, marginTop: 14, backgroundColor: "rgba(255,255,255,0.2)" }}>
          {segments.map((segment) => (
            <View key={segment.key} style={{ flex: segment.count, backgroundColor: segment.color, opacity: segment.key === "ok" ? 0.85 : 1 }} />
          ))}
        </View>
      ) : null}
      {onReorder || onCount ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {onReorder ? <HeroButton icon="cart-outline" label="Da ordinare" onPress={onReorder} /> : null}
          {onCount ? <HeroButton tone={onReorder ? "clear" : "solid"} icon="clipboard-outline" label="Conta" onPress={onCount} /> : null}
        </View>
      ) : null}
    </Hero>
  );
}

export const MOVE_OPTIONS: Array<{ key: InventoryMove; label: string; icon: IconName }> = [
  { key: "IN", label: "Carico", icon: "add-circle-outline" },
  { key: "OUT", label: "Consumo", icon: "remove-circle-outline" },
  { key: "WASTE", label: "Scarto", icon: "trash-outline" },
  { key: "COUNT", label: "Conta", icon: "clipboard-outline" },
];

export function MoveTabs({ value, onChange }: { value: InventoryMove; onChange: (value: InventoryMove) => void }) {
  const theme = useTheme();
  const colorFor = (key: InventoryMove) => (key === "IN" ? theme.colors.success : key === "WASTE" ? theme.colors.danger : key === "COUNT" ? theme.colors.info : theme.colors.accent);
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {MOVE_OPTIONS.map((option) => {
        const active = option.key === value;
        const color = colorFor(option.key);
        return (
          <Pressy
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 4,
              paddingVertical: 10,
              borderRadius: theme.radius.md,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: active ? color : theme.colors.glassBorder,
              backgroundColor: active ? withAlpha(color, theme.dark ? 0.26 : 0.13) : theme.colors.field,
            }}
          >
            <Ionicons name={option.icon} size={20} color={active ? color : theme.colors.inkSoft} />
            <Text variant="caption" style={{ fontWeight: "700", color: active ? color : theme.colors.inkSoft }}>
              {option.label}
            </Text>
          </Pressy>
        );
      })}
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: 12, borderRadius: theme.radius.md, borderCurve: "continuous", backgroundColor: theme.colors.field, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
      <Text variant="caption" muted numberOfLines={1}>
        {label}
      </Text>
      <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ["tabular-nums"], color: color ?? theme.colors.ink }}>
        {value}
      </Text>
    </View>
  );
}
