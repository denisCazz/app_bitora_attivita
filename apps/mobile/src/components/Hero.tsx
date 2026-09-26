import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Pressy, Text, useTheme } from "@rapportini/ui";

type IconName = keyof typeof Ionicons.glyphMap;

export function Hero({ colors, style, children }: { colors?: readonly [string, string]; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: theme.radius.xl,
          borderCurve: "continuous",
          overflow: "hidden",
          padding: 20,
          gap: 4,
          shadowColor: colors?.[0] ?? theme.colors.accent,
          shadowOpacity: theme.dark ? 0 : 0.28,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        },
        style,
      ]}
    >
      <LinearGradient colors={colors ?? [theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0)"]} end={{ x: 0.2, y: 0.8 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function HeroPill({ label, icon }: { label: string; icon?: IconName }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: 99, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4 }}>
      {icon ? <Ionicons name={icon} size={12} color="#fff" /> : null}
      <Text variant="caption" numberOfLines={1} style={{ color: "#fff", fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}

export function HeroButton({ label, icon, onPress, loading, tone = "solid" }: { label: string; icon?: IconName; onPress: () => void; loading?: boolean; tone?: "solid" | "clear" }) {
  const theme = useTheme();
  const solid = tone === "solid";
  const color = solid ? theme.colors.accent : "#fff";
  return (
    <Pressy
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: solid ? 1 : undefined,
        minHeight: 48,
        paddingHorizontal: 18,
        borderRadius: theme.radius.md,
        borderCurve: "continuous",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: solid ? "#fff" : "rgba(255,255,255,0.2)",
      }}
    >
      {loading ? <ActivityIndicator color={color} /> : icon ? <Ionicons name={icon} size={18} color={color} /> : null}
      <Text style={{ color, fontWeight: "700" }}>{label}</Text>
    </Pressy>
  );
}

export function SectionLabel({ title, accessory }: { title: string; accessory?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, minHeight: 24 }}>
      <Text variant="caption" muted style={{ fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
        {title}
      </Text>
      {accessory}
    </View>
  );
}

export function CircleButton({ icon, label, onPress, size = 36, tone = "soft" }: { icon: IconName; label: string; onPress: () => void; size?: number; tone?: "soft" | "plain" }) {
  const theme = useTheme();
  return (
    <Pressy
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      scaleTo={0.9}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "soft" ? theme.colors.accentSoft : theme.colors.field,
        borderWidth: tone === "plain" ? 1 : 0,
        borderColor: theme.colors.glassBorder,
      }}
    >
      <Ionicons name={icon} size={size * 0.46} color={tone === "soft" ? theme.colors.accent : theme.colors.ink} />
    </Pressy>
  );
}
