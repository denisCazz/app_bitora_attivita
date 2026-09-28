import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Pressy, Text, useTheme } from "@rapportini/ui";

const SWATCHES = ["#E25B2A", "#D92D6B", "#B42318", "#C4820E", "#7A4E2D", "#1C6B56", "#12808A", "#175CD3", "#4A48C9", "#7C3AED", "#475467", "#1F2937"];
const SATURATION = 0.72;
// Buttons always use white text: keep the colour dark enough to stay readable.
const LIGHT_MIN = 0.22;
const LIGHT_MAX = 0.56;
const KNOB = 28;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function hslToHex({ h, s, l }: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const value = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return { h: 16, s: SATURATION, l: 0.53 };
  const int = Number.parseInt(match[1]!, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function Track({ colors, position, label, onChange }: { colors: string[]; position: number; label: string; onChange: (ratio: number, done: boolean) => void }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const ratio = (x: number) => (width > 0 ? clamp(x / width, 0, 1) : position);
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => onChange(ratio(event.x), true));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onUpdate((event) => onChange(ratio(event.x), false))
    .onEnd((event) => onChange(ratio(event.x), true));

  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => onChange(clamp(position + (event.nativeEvent.actionName === "increment" ? 0.05 : -0.05), 0, 1), true)}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ height: KNOB + 8, justifyContent: "center" }}
        >
          <View style={{ height: 18, borderRadius: 9, overflow: "hidden", borderWidth: 1, borderColor: theme.colors.line }}>
            <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: clamp(position * width - KNOB / 2, 0, Math.max(0, width - KNOB)),
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: "#fff",
              borderWidth: 3,
              borderColor: "rgba(0,0,0,0.18)",
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const theme = useTheme();
  const start = hexToHsl(value);
  const [hue, setHue] = useState(start.h);
  const [light, setLight] = useState(clamp(start.l, LIGHT_MIN, LIGHT_MAX));
  const selected = value.toUpperCase();

  function pick(next: { h?: number; l?: number }, done: boolean) {
    const h = next.h ?? hue;
    const l = next.l ?? light;
    setHue(h);
    setLight(l);
    onChange(hslToHex({ h, s: SATURATION, l }));
    if (done) void Haptics.selectionAsync().catch(() => undefined);
  }

  function choose(hex: string) {
    const hsl = hexToHsl(hex);
    setHue(hsl.h);
    setLight(clamp(hsl.l, LIGHT_MIN, LIGHT_MAX));
    onChange(hex);
  }

  const hues = [0, 45, 90, 135, 180, 225, 270, 315, 360].map((h) => hslToHex({ h, s: SATURATION, l: light }));
  const lights = [LIGHT_MIN, (LIGHT_MIN + LIGHT_MAX) / 2, LIGHT_MAX].map((l) => hslToHex({ h: hue, s: SATURATION, l }));

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SWATCHES.map((hex) => {
          const active = hex === selected;
          return (
            <Pressy
              key={hex}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Colore ${SWATCHES.indexOf(hex) + 1}`}
              haptic="light"
              onPress={() => choose(hex)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                padding: 3,
                borderWidth: 2,
                borderColor: active ? theme.colors.ink : "transparent",
              }}
            >
              <View style={{ flex: 1, borderRadius: 18, backgroundColor: hex, alignItems: "center", justifyContent: "center" }}>
                {active ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
              </View>
            </Pressy>
          );
        })}
      </View>
      <Track label="Tonalità" colors={hues} position={hue / 360} onChange={(ratio, done) => pick({ h: ratio * 360 }, done)} />
      <Track label="Luminosità" colors={lights} position={(light - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN)} onChange={(ratio, done) => pick({ l: LIGHT_MIN + ratio * (LIGHT_MAX - LIGHT_MIN) }, done)} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, height: 48, borderRadius: 16, borderCurve: "continuous", backgroundColor: value, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Anteprima pulsante</Text>
        </View>
        <View style={{ width: 48, height: 48, borderRadius: 16, borderCurve: "continuous", backgroundColor: value, opacity: 0.18 }} />
      </View>
    </View>
  );
}
