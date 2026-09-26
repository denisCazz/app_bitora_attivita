import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Pressy, Text, useTheme } from "@rapportini/ui";

export function Checkbox({
  checked,
  onChange,
  children,
  error,
  color,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  error?: string;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Pressy
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        haptic="none"
        scaleTo={0.99}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
      >
        <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? theme.colors.accent : color ?? theme.colors.inkSoft} />
        <Text variant="caption" style={{ flex: 1, color: color ?? theme.colors.ink, lineHeight: 18 }}>
          {children}
        </Text>
      </Pressy>
      {error ? (
        <Text variant="caption" style={{ color: theme.colors.danger, marginLeft: 32 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
