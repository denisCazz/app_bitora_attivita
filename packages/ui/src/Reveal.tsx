import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, FadeIn } from "react-native-reanimated";
import { useTheme } from "./theme";

export function Reveal({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const theme = useTheme();
  const delay = Math.min(index, theme.motion.maxStagger) * theme.motion.stagger;
  return (
    <Animated.View
      style={style}
      entering={FadeIn.duration(theme.motion.enter).delay(delay).easing(Easing.out(Easing.cubic))}
    >
      {children}
    </Animated.View>
  );
}
