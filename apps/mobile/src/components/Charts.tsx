import { useState } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Text, useTheme } from "@rapportini/ui";

const CHART_HEIGHT = 132;

function AxisLabels({ labels }: { labels: string[] }) {
  const shown = labels.length <= 7 ? labels : [labels[0] ?? "", labels[Math.floor((labels.length - 1) / 2)] ?? "", labels[labels.length - 1] ?? ""];
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      {shown.map((label, index) => (
        <Text key={`${label}-${index}`} variant="caption" muted numberOfLines={1} style={{ fontVariant: ["tabular-nums"] }}>
          {label}
        </Text>
      ))}
    </View>
  );
}

export function TrendChart({
  points,
  incomeColor,
  expenseColor,
}: {
  points: Array<{ label: string; income: number; expense: number }>;
  incomeColor: string;
  expenseColor: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...points.flatMap((point) => [point.income, point.expense]));
  const slot = points.length ? width / points.length : 0;
  const bar = Math.max(2, Math.min(7, (slot - 3) / 2));

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT} accessibilityElementsHidden>
          <Rect x={0} y={CHART_HEIGHT - 1} width={width} height={1} fill={theme.colors.line} />
          {points.flatMap((point, index) => {
            const pair = bar * 2 + 1;
            const origin = index * slot + (slot - pair) / 2;
            const incomeHeight = (point.income / max) * (CHART_HEIGHT - 8);
            const expenseHeight = (point.expense / max) * (CHART_HEIGHT - 8);
            const bars = [];
            if (incomeHeight >= 1) {
              bars.push(<Rect key={`${point.label}-${index}-in`} x={origin} y={CHART_HEIGHT - 1 - incomeHeight} width={bar} height={incomeHeight} rx={2} fill={incomeColor} />);
            }
            if (expenseHeight >= 1) {
              bars.push(
                <Rect key={`${point.label}-${index}-out`} x={origin + bar + 1} y={CHART_HEIGHT - 1 - expenseHeight} width={bar} height={expenseHeight} rx={2} fill={expenseColor} />,
              );
            }
            return bars;
          })}
        </Svg>
      ) : (
        <View style={{ height: CHART_HEIGHT }} />
      )}
      <AxisLabels labels={points.map((point) => point.label)} />
    </View>
  );
}

export function Bars({ points, color }: { points: Array<{ label: string; value: number }>; color: string }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...points.map((point) => point.value));
  const slot = points.length ? width / points.length : 0;
  const bar = Math.max(2, Math.min(10, slot - 2));

  return (
    <View style={{ gap: 8 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT} accessibilityElementsHidden>
          <Rect x={0} y={CHART_HEIGHT - 1} width={width} height={1} fill={theme.colors.line} />
          {points.map((point, index) => {
            const height = (point.value / max) * (CHART_HEIGHT - 8);
            if (height < 1) return null;
            const origin = index * slot + (slot - bar) / 2;
            return <Rect key={`${point.label}-${index}`} x={origin} y={CHART_HEIGHT - 1 - height} width={bar} height={height} rx={2} fill={color} />;
          })}
        </Svg>
      ) : (
        <View style={{ height: CHART_HEIGHT }} />
      )}
      <AxisLabels labels={points.map((point) => point.label)} />
    </View>
  );
}

export function ShareRows({
  rows,
}: {
  rows: Array<{ id: string; label: string; value: number; display: string; color: string }>;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row) => (
        <View key={row.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {row.label}
            </Text>
            <Text variant="caption" style={{ fontVariant: ["tabular-nums"], fontWeight: "700" }}>
              {row.display}
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.field, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: row.color }} />
          </View>
        </View>
      ))}
    </View>
  );
}
