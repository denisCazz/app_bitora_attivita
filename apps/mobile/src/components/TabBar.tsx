import type { NavItem } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, GlassGroup, Pressy, supportsLiquidGlass, Text, useTheme, withAlpha } from "@rapportini/ui";

function hrefFor(item: NavItem) {
  if (item.route === "/") return "/(app)";
  return `/(app)${item.route}`;
}

function isActive(item: NavItem, pathname: string) {
  if (item.route === "/") return pathname === "/" || pathname === "/(app)";
  return pathname.startsWith(item.route);
}

const BAR_PADDING = 5;

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
    x.value = withSpring(activeIndex * slot, { damping: 20, stiffness: 240, mass: 0.8 });
  }, [activeIndex, slot, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (items.length === 0 || pathname.startsWith("/assistant")) return null;

  const liquid = supportsLiquidGlass;
  const floatingShadow = liquid
    ? null
    : { shadowColor: "#000", shadowOpacity: theme.dark ? 0.5 : 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom - 6, 12), alignItems: "center" }}>
      <GlassGroup spacing={8} pointerEvents="box-none" style={{ width: "92%", maxWidth: 580, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[{ flex: 1, borderRadius: 31 }, floatingShadow]}>
          <Glass liquid interactive intensity={70} rounded={31}>
            <View style={{ flexDirection: "row", padding: BAR_PADDING }} onLayout={(event) => setWidth(event.nativeEvent.layout.width - BAR_PADDING * 2)}>
              {slot > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      top: BAR_PADDING,
                      bottom: BAR_PADDING,
                      left: BAR_PADDING,
                      width: slot,
                      borderRadius: 26,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: liquid ? withAlpha(theme.colors.accent, theme.dark ? 0.26 : 0.16) : undefined,
                    },
                    indicator,
                  ]}
                >
                  {liquid ? null : (
                    <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  )}
                </Animated.View>
              ) : null}
              {items.map((item, index) => {
                const active = index === activeIndex;
                const color = active ? (liquid ? theme.colors.accent : theme.colors.accentInk) : theme.colors.inkSoft;
                const icon = active ? item.icon.replace(/-outline$/, "") : item.icon;
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
                    <Ionicons name={(icon in Ionicons.glyphMap ? icon : item.icon) as keyof typeof Ionicons.glyphMap} size={22} color={color} />
                    <Text variant="caption" numberOfLines={1} style={{ color, fontWeight: active ? "700" : "600", fontSize: 11, lineHeight: 14 }}>
                      {item.label}
                    </Text>
                  </Pressy>
                );
              })}
            </View>
          </Glass>
        </View>
        <Pressy
          accessibilityRole="button"
          accessibilityLabel="Assistente"
          haptic="medium"
          scaleTo={0.9}
          onPress={() => router.push("/(app)/assistant" as never)}
          style={[
            { width: 62, height: 62, borderRadius: 31 },
            liquid ? null : { shadowColor: theme.colors.accent, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
          ]}
        >
          {liquid ? (
            <Glass liquid interactive glassTint={theme.colors.accent} rounded={31} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={26} color={theme.colors.accentInk} />
            </Glass>
          ) : (
            <View style={{ flex: 1, borderRadius: 31, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Ionicons name="sparkles" size={26} color={theme.colors.accentInk} />
            </View>
          )}
        </Pressy>
      </GlassGroup>
    </View>
  );
}
