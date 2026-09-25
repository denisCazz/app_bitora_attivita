import { memo, useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "./theme";

function Glow({ id, color, cx, cy, r, opacity }: { id: string; color: string; cx: string; cy: string; r: string; opacity: number }) {
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} r={r} gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.55} />
          <Stop offset="0.75" stopColor={color} stopOpacity={opacity * 0.18} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </>
  );
}

function Aurora() {
  const theme = useTheme();
  const id = useId().replace(/:/g, "");
  const [first, second, third] = theme.aurora;
  const strength = theme.dark ? 0.4 : 0.46;
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`${id}-base`} cx="50%" cy="0%" r="90%" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={theme.backdrop[0]} />
          <Stop offset="1" stopColor={theme.backdrop[1]} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-base)`} />
      <Glow id={`${id}-g1`} color={first} cx="8%" cy="0%" r="75%" opacity={strength} />
      <Glow id={`${id}-g2`} color={second} cx="100%" cy="46%" r="68%" opacity={strength * 0.75} />
      <Glow id={`${id}-g3`} color={third} cx="12%" cy="100%" r="62%" opacity={strength * 0.65} />
    </Svg>
  );
}

function Drifting() {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [progress]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 0.5) * 28 }, { translateY: (progress.value - 0.5) * -18 }, { scale: 1.06 }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, animated]}>
      <Aurora />
    </Animated.View>
  );
}

export const Backdrop = memo(function Backdrop({ animated = false }: { animated?: boolean }) {
  const theme = useTheme();
  return (
    <View pointerEvents="none" collapsable={false} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.paper, overflow: "hidden" }]}>
      {animated ? <Drifting /> : <Aurora />}
    </View>
  );
});
