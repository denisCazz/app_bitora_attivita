import { LinearGradient } from "expo-linear-gradient";
import { Pressy } from "./Pressy";
import { Text } from "./Text";
import { useTheme } from "./theme";

export function Fab({ label = "+", onPress }: { label?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel="Nuovo"
      haptic="medium"
      scaleTo={0.94}
      onPress={onPress}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        shadowColor: theme.colors.accent,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <LinearGradient
        colors={[theme.colors.accent, theme.colors.accentAlt]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: theme.colors.accentInk, fontSize: 30, lineHeight: 34, fontWeight: "500" }}>{label}</Text>
      </LinearGradient>
    </Pressy>
  );
}
