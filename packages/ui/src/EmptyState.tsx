import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { useTheme } from "./theme";

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: theme.space.xxl, gap: 8 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 24,
          borderCurve: "continuous",
          backgroundColor: theme.colors.accentSoft,
          borderWidth: 1,
          borderColor: theme.colors.glassBorder,
          marginBottom: 8,
          transform: [{ rotate: "-8deg" }],
        }}
      />
      <Text variant="title" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Text muted style={{ textAlign: "center" }}>
        {message}
      </Text>
      {action}
    </View>
  );
}
