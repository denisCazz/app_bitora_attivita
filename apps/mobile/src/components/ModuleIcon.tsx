import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@rapportini/ui";

export function ModuleIcon({ name, active, size = 44 }: { name: string; active?: boolean; size?: number }) {
  const theme = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accentSoft }}>
      {active ? <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} style={StyleSheet.absoluteFill} /> : null}
      <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size / 2} color={active ? theme.colors.accentInk : theme.colors.accent} />
    </View>
  );
}
