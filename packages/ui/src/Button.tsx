import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { Glass } from "./Glass";
import { Pressy } from "./Pressy";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { withAlpha } from "./tokens";

type Tone = "primary" | "secondary" | "soft" | "ghost" | "danger";

export function Button({
  label,
  tone = "primary",
  loading,
  style,
  disabled,
  ...props
}: Omit<PressableProps, "style"> & { label: string; tone?: Tone; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const color = tone === "soft" ? theme.colors.accent : tone === "secondary" || tone === "ghost" ? theme.colors.ink : theme.colors.accentInk;
  const shape: ViewStyle = { minHeight: 54, borderRadius: theme.radius.md, borderCurve: "continuous", paddingHorizontal: theme.space.lg, alignItems: "center", justifyContent: "center" };
  const content = loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: "700", letterSpacing: -0.1 }}>{label}</Text>;

  return (
    <Pressy
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      style={[
        { opacity: disabled ? 0.45 : 1, borderRadius: theme.radius.md },
        tone === "primary" || tone === "danger"
          ? {
              shadowColor: tone === "danger" ? theme.colors.danger : theme.colors.accent,
              shadowOpacity: 0.35,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
            }
          : null,
        style,
      ]}
      {...props}
    >
      {tone === "primary" || tone === "danger" ? (
        <View style={[shape, { overflow: "hidden" }]}>
          <LinearGradient
            colors={tone === "danger" ? [theme.colors.danger, theme.colors.danger] : [theme.colors.accent, theme.colors.accentAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} end={{ x: 0, y: 0.6 }} style={StyleSheet.absoluteFill} />
          {content}
        </View>
      ) : tone === "soft" ? (
        <View style={[shape, { minHeight: 46, backgroundColor: withAlpha(theme.colors.accent, theme.dark ? 0.16 : 0.1) }]}>{content}</View>
      ) : tone === "secondary" ? (
        <Glass rounded={theme.radius.md} style={shape}>
          {content}
        </Glass>
      ) : (
        <View style={shape}>{content}</View>
      )}
    </Pressy>
  );
}
