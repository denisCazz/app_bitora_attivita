import type { ReactNode } from "react";
import { View } from "react-native";
import { Pressy } from "./Pressy";
import { Text } from "./Text";
import { useTheme } from "./theme";

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressy
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.98}
      haptic="none"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.line,
      }}
    >
      {leading ? (
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          {leading}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="caption" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Text muted style={{ fontSize: 20 }}>›</Text> : null)}
    </Pressy>
  );
}
