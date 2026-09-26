import { BlurView } from "expo-blur";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "./theme";

export const supportsBackdropBlur = Platform.OS !== "android";

function detectLiquidGlass() {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export const supportsLiquidGlass = detectLiquidGlass();

// UIVisualEffectView skips rendering while any ancestor is at alpha 0, so the effect
// is switched on only after enter/fade transitions have settled.
const LIQUID_SETTLE_MS = 320;

function LiquidGlass({
  rounded,
  interactive,
  glassTint,
  scheme,
  style,
  ...props
}: ViewProps & { rounded: number; interactive?: boolean; glassTint?: string; scheme: "light" | "dark" }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), LIQUID_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <GlassView
      {...props}
      glassEffectStyle={{ style: settled ? "regular" : "none", animate: true, animationDuration: 0.35 }}
      tintColor={glassTint}
      isInteractive={interactive}
      colorScheme={scheme}
      style={[{ borderRadius: rounded, borderCurve: "continuous" }, style]}
    />
  );
}

export function Glass({
  intensity = 45,
  blur = false,
  liquid = false,
  interactive = false,
  glassTint,
  rounded,
  tint,
  style,
  children,
  ...props
}: ViewProps & {
  intensity?: number;
  blur?: boolean;
  /** Native iOS 26+ Liquid Glass; falls back to blur/flat glass elsewhere. Use for floating chrome, not content. */
  liquid?: boolean;
  interactive?: boolean;
  glassTint?: string;
  rounded?: number;
  tint?: "light" | "dark";
}) {
  const theme = useTheme();
  const tone = tint ?? (theme.dark ? "dark" : "light");
  const radius = rounded ?? theme.radius.lg;
  if (liquid && supportsLiquidGlass) {
    return (
      <LiquidGlass {...props} rounded={radius} interactive={interactive} glassTint={glassTint} scheme={tone} style={style}>
        {children}
      </LiquidGlass>
    );
  }
  const live = (blur || liquid) && supportsBackdropBlur;
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
      style={[
        { borderRadius: radius, borderCurve: "continuous", overflow: "hidden", borderWidth: 1, borderColor: border, backgroundColor: live ? "transparent" : fill },
        style,
      ]}
    >
      {live ? (
        <>
          <BlurView intensity={intensity} tint={tone} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glassTint ?? fill, opacity: glassTint ? 0.85 : 1 }]} />
        </>
      ) : (
        <>
          {glassTint ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glassTint }]} /> : null}
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 12, right: 12, height: 1, backgroundColor: tone === "dark" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.9)" }}
          />
        </>
      )}
      {children}
    </View>
  );
}

export function GlassGroup({ spacing, style, children, ...props }: ViewProps & { spacing?: number }) {
  if (supportsLiquidGlass) {
    return (
      <GlassContainer {...props} spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return (
    <View {...props} style={style}>
      {children}
    </View>
  );
}
