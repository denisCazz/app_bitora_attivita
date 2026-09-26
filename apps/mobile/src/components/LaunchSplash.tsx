import { Text, ThemeProvider } from "@rapportini/ui";
import { useEventListener } from "expo";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { t } from "../i18n";

const splashVideo = require("../../assets/splash.mp4") as number;
const splashMark = require("../../assets/splash-icon.png") as number;

const MARK = 280;
const MIN_MS = 1100;
const FADE_MS = 420;
const VIDEO_CAP_MS = 2400;

export function LaunchSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  return (
    <ThemeProvider scheme="dark">
      <SplashBody ready={ready} onFinish={onFinish} />
    </ThemeProvider>
  );
}

function SplashBody({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const opacity = useSharedValue(1);
  const copy = useSharedValue(0);
  const mountedAt = useRef(Date.now());
  const [ended, setEnded] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const overlay = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: (1 - copy.value) * 10 }],
  }));

  const player = useVideoPlayer(splashVideo, (video) => {
    video.loop = false;
    video.muted = true;
    video.volume = 0;
    video.audioMixingMode = "mixWithOthers";
    video.play();
  });

  useEventListener(player, "playToEnd", () => setEnded(true));
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "error") setEnded(true);
    if (status === "readyToPlay" && !player.playing) player.play();
  });

  useEffect(() => {
    copy.value = withDelay(220, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [copy]);

  useEffect(() => {
    const cap = setTimeout(() => setEnded(true), VIDEO_CAP_MS);
    return () => clearTimeout(cap);
  }, []);

  useEffect(() => {
    if (!ready || !ended) return;
    const hold = Math.max(0, MIN_MS - (Date.now() - mountedAt.current));
    const fade = setTimeout(() => {
      opacity.value = withTiming(0, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) });
    }, hold);
    const done = setTimeout(onFinish, hold + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [ended, onFinish, opacity, ready]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => undefined);
      }}
      style={[StyleSheet.absoluteFill, { zIndex: 20, backgroundColor: "#000" }, overlay]}
    >
      <StatusBar style="light" />
      <View style={styles.stage}>
        <View style={styles.mark}>
          <VideoView
            player={player}
            style={[styles.video, { opacity: frameReady ? 1 : 0 }]}
            nativeControls={false}
            contentFit="contain"
            allowsVideoFrameAnalysis={false}
            onFirstFrameRender={() => setFrameReady(true)}
          />
          {frameReady ? null : <Image source={splashMark} style={styles.video} contentFit="contain" />}
        </View>
        <Animated.View style={[styles.copy, copyStyle]}>
          <Text variant="title" style={styles.name}>
            {t("appName")}
          </Text>
          <Text style={styles.tagline}>{t("tagline")}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: MARK,
    height: MARK,
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: MARK,
    height: MARK,
    backgroundColor: "#000",
    pointerEvents: "none",
  },
  copy: {
    position: "absolute",
    top: "50%",
    marginTop: MARK * 0.42,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 8,
  },
  name: {
    color: "#fff",
    textAlign: "center",
  },
  tagline: {
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
  },
});
