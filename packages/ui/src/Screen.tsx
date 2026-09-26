import { Children, isValidElement, useState, type ReactNode } from "react";
import { RefreshControl, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Backdrop } from "./Backdrop";
import { Fab } from "./Fab";
import { Glass } from "./Glass";
import { Pressy } from "./Pressy";
import { Reveal } from "./Reveal";
import { useTheme } from "./theme";
import { FAB_CLEARANCE, FLOATING_TAB_SPACE, withAlpha } from "./tokens";

function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressy onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} scaleTo={0.9} style={{ alignSelf: "flex-start", borderRadius: 22 }}>
      <Glass liquid interactive rounded={22} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Svg width={12} height={20} viewBox="0 0 12 20">
          <Path d="M10 2L2 10l8 8" stroke={theme.colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Glass>
    </Pressy>
  );
}

function TopEdge({ scrollY }: { scrollY: SharedValue<number> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const animated = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 24], [0, 1], Extrapolation.CLAMP) }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + 20 }, animated]}>
      <LinearGradient
        colors={[theme.colors.paper, withAlpha(theme.colors.paper, 0.75), withAlpha(theme.colors.paper, 0)]}
        locations={[0, 0.55, 1]}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  onBack,
  backLabel = "Indietro",
  onRefresh,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  onBack?: () => void;
  backLabel?: string;
  onRefresh?: () => Promise<unknown> | void;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
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

  async function refresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

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
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={[contentStyle, style]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.accent} colors={[theme.colors.accent]} progressViewOffset={insets.top} />
          ) : undefined
        }
      >
        {back}
        {body.map((child, index) => (
          <Reveal key={(child as { key?: string }).key ?? index} index={index}>
            {child}
          </Reveal>
        ))}
      </Animated.ScrollView>
      <TopEdge scrollY={scrollY} />
      {fabSlot}
    </View>
  );
}
