import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useTheme } from "./theme";

export function Skeleton({
  height = 18,
  width = "100%" as number | `${number}%`,
  radius,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <View style={{ height, width, borderRadius: radius ?? theme.radius.sm, borderCurve: "continuous", backgroundColor: theme.colors.glassSolid }} />
    </Animated.View>
  );
}
