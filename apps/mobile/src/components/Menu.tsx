import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Card, Pressy, Text, useTheme, withAlpha } from "@rapportini/ui";

export type MenuTone = "accent" | "muted" | "danger";

export function IconWell({ name, tone = "accent" }: { name: keyof typeof Ionicons.glyphMap; tone?: MenuTone }) {
  const theme = useTheme();
  const color = tone === "danger" ? theme.colors.danger : tone === "muted" ? theme.colors.inkSoft : theme.colors.accent;
  return (
    <View style={{ width: 46, height: 46, borderRadius: 16, borderCurve: "continuous", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <LinearGradient
        colors={[withAlpha(color, theme.dark ? 0.34 : 0.2), withAlpha(color, theme.dark ? 0.1 : 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={name} size={21} color={color} />
    </View>
  );
}

export function Chevron() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.dark ? "rgba(255,255,255,0.06)" : "rgba(18,19,24,0.05)",
      }}
    >
      <Ionicons name="chevron-forward" size={15} color={theme.colors.inkSoft} />
    </View>
  );
}

export function Menu({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  const card = <Card style={{ padding: 6, gap: 2 }}>{children}</Card>;
  if (!title) return card;
  return (
    <View style={{ gap: theme.space.xs }}>
      <Text variant="caption" muted style={{ fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 6 }}>
        {title}
      </Text>
      {card}
    </View>
  );
}

export function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  tone = "accent",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  tone?: MenuTone;
}) {
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={!onPress}
      scaleTo={onPress ? 0.985 : 1}
      haptic={onPress ? "light" : "none"}
      onPress={onPress}
      style={{ borderRadius: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 18 }}>
        <IconWell name={icon} tone={tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" muted numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
        {onPress ? <Chevron /> : null}
      </View>
    </Pressy>
  );
}
