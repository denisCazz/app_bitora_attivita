import type { NavItem } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Pressy, Text, useTheme } from "@rapportini/ui";

function hrefFor(item: NavItem) {
  if (item.route === "/") return "/(app)";
  return `/(app)${item.route}`;
}

function isActive(item: NavItem, pathname: string) {
  if (item.route === "/") return pathname === "/" || pathname === "/(app)";
  return pathname.startsWith(item.route);
}

export function TabBar({ items }: { items: NavItem[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const matched = items.findIndex((item) => isActive(item, pathname));
  const activeIndex = matched >= 0 ? matched : Math.max(0, items.findIndex((item) => item.key === "more"));
  const slot = items.length ? width / items.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withTiming(activeIndex * slot, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [activeIndex, slot, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (items.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom - 6, 12), alignItems: "center" }}>
      <Glass
        intensity={70}
        rounded={30}
        style={{
          width: "92%",
          maxWidth: 520,
          shadowColor: "#000",
          shadowOpacity: theme.dark ? 0.5 : 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        <View style={{ flexDirection: "row", padding: 6 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width - 12)}>
          {slot > 0 ? (
            <Animated.View style={[{ position: "absolute", top: 6, bottom: 6, left: 6, width: slot, borderRadius: 24, overflow: "hidden" }, indicator]}>
              <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
          {items.map((item, index) => {
            const active = index === activeIndex;
            const color = active ? theme.colors.accentInk : theme.colors.inkSoft;
            return (
              <Pressy
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={item.label}
                scaleTo={0.9}
                onPress={() => router.navigate(hrefFor(item) as never)}
                style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 9 }}
              >
                <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={21} color={color} />
                <Text variant="caption" numberOfLines={1} style={{ color, fontWeight: "700", fontSize: 11, lineHeight: 14 }}>
                  {item.label}
                </Text>
              </Pressy>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}
