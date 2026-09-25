import * as Haptics from "expo-haptics";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Pressy({
  scaleTo = 0.96,
  haptic = "light",
  style,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: Omit<PressableProps, "style"> & {
  scaleTo?: number;
  haptic?: "light" | "medium" | "none";
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.value = withSpring(scaleTo, theme.motion.spring);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, theme.motion.spring);
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic !== "none") {
          const style = haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
          void Haptics.impactAsync(style).catch(() => undefined);
        }
        onPress?.(event);
      }}
      style={[style, animated]}
    />
  );
}
