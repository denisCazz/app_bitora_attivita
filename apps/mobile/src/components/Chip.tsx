import { Pressy, Text, useTheme, withAlpha } from "@rapportini/ui";

export function Chip({ label, active, onPress, tone }: { label: string; active: boolean; onPress: () => void; tone?: string }) {
  const theme = useTheme();
  const color = tone ?? theme.colors.accent;
  return (
    <Pressy
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: active ? color : theme.colors.glassBorder,
        backgroundColor: active ? withAlpha(color, theme.dark ? 0.28 : 0.14) : theme.colors.field,
      }}
    >
      <Text variant="caption" style={{ fontWeight: "700", color: active ? color : theme.colors.inkSoft }}>
        {label}
      </Text>
    </Pressy>
  );
}
