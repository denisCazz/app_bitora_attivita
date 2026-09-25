import { Children, isValidElement, type ReactNode } from "react";
import { ScrollView, View, type ViewStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop } from "./Backdrop";
import { Fab } from "./Fab";
import { Pressy } from "./Pressy";
import { Reveal } from "./Reveal";
import { Text } from "./Text";
import { useTheme } from "./theme";
import { FAB_CLEARANCE, FLOATING_TAB_SPACE } from "./tokens";

function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressy
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingRight: 10, marginLeft: -4 }}
    >
      <Text style={{ fontSize: 26, lineHeight: 26, color: theme.colors.accent }}>‹</Text>
      <Text style={{ color: theme.colors.accent, fontWeight: "600" }}>{label}</Text>
    </Pressy>
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  onBack,
  backLabel = "Indietro",
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  onBack?: () => void;
  backLabel?: string;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const nodes = Children.toArray(children);
  const fab = nodes.find((node) => isValidElement(node) && node.type === Fab);
  const body = nodes.filter((node) => node !== fab);
  const contentStyle: ViewStyle = {
    paddingHorizontal: padded ? theme.space.lg : 0,
    paddingTop: insets.top + theme.space.sm,
    paddingBottom: insets.bottom + FLOATING_TAB_SPACE + (fab ? FAB_CLEARANCE : 0),
    gap: theme.space.lg,
    flexGrow: 1,
  };
  const back = onBack ? <BackButton onPress={onBack} label={backLabel} /> : null;
  const fabSlot = fab ? (
    <View pointerEvents="box-none" style={{ position: "absolute", right: 20, bottom: insets.bottom + FLOATING_TAB_SPACE + 8 }}>
      {fab}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
        <Backdrop />
        <Animated.View entering={FadeIn.duration(theme.motion.enter)} style={[{ flex: 1 }, contentStyle, style]}>
          {back}
          {body}
        </Animated.View>
        {fabSlot}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
      <Backdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[contentStyle, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
      >
        {back}
        {body.map((child, index) => (
          <Reveal key={(child as { key?: string }).key ?? index} index={index}>
            {child}
          </Reveal>
        ))}
      </ScrollView>
      {fabSlot}
    </View>
  );
}
