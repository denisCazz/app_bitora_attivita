import { View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { withAlpha } from "./tokens";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  const theme = useTheme();
  const color =
    tone === "accent"
      ? theme.colors.accent
      : tone === "success"
        ? theme.colors.success
        : tone === "warning"
          ? theme.colors.warning
          : tone === "danger"
            ? theme.colors.danger
            : theme.colors.inkSoft;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: withAlpha(color, theme.dark ? 0.22 : 0.13),
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: withAlpha(color, 0.25),
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text variant="caption" style={{ color: tone === "neutral" ? theme.colors.ink : color, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}
