import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "./theme";

export const supportsBackdropBlur = Platform.OS !== "android";

export function Glass({
  intensity = 45,
  blur = false,
  rounded,
  tint,
  style,
  children,
  ...props
}: ViewProps & { intensity?: number; blur?: boolean; rounded?: number; tint?: "light" | "dark" }) {
  const theme = useTheme();
  const tone = tint ?? (theme.dark ? "dark" : "light");
  const live = blur && supportsBackdropBlur;
  const border = tint === "dark" ? "rgba(255,255,255,0.16)" : tint === "light" ? "rgba(255,255,255,0.9)" : theme.colors.glassBorder;
  const fill = live
    ? tint === "dark"
      ? "rgba(12,13,17,0.38)"
      : tint === "light"
        ? "rgba(255,255,255,0.5)"
        : theme.colors.glass
    : tint === "dark"
      ? "rgba(20,21,27,0.78)"
      : tint === "light"
        ? "rgba(255,255,255,0.8)"
        : theme.colors.glassFlat;
  return (
    <View
      {...props}
      style={[{ borderRadius: rounded ?? theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: border, backgroundColor: live ? "transparent" : fill }, style]}
    >
      {live ? (
        <>
          <BlurView intensity={intensity} tint={tone} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        </>
      ) : (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 12, right: 12, height: 1, backgroundColor: tone === "dark" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.9)" }}
        />
      )}
      {children}
    </View>
  );
}
