import { palette, Text, ThemeProvider } from "@rapportini/ui";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "../i18n";
import { BrandMark } from "./PhotoStage";

const MIN_MS = 1100;
const FADE_MS = 420;

export function LaunchSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  return (
    <ThemeProvider accent={palette.ember} scheme="dark">
      <SplashBody ready={ready} onFinish={onFinish} />
    </ThemeProvider>
  );
}

function SplashBody({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.94);
  const mountedAt = useRef(Date.now());
  const overlay = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    scale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [scale]);

  useEffect(() => {
    if (!ready) return;
    const hold = Math.max(0, MIN_MS - (Date.now() - mountedAt.current));
    const fade = setTimeout(() => {
      opacity.value = withTiming(0, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) });
    }, hold);
    const done = setTimeout(onFinish, hold + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [onFinish, opacity, ready]);

  return (
    <Animated.View
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => undefined);
      }}
      style={[StyleSheet.absoluteFill, { zIndex: 20, backgroundColor: "#07080B" }, overlay]}
    >
      <StatusBar style="light" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Animated.View style={[{ alignItems: "center", gap: 18 }, mark]}>
          <BrandMark accent={palette.ember} size={72} />
          <Text style={{ color: "rgba(255,255,255,0.72)", textAlign: "center" }}>{t("tagline")}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
