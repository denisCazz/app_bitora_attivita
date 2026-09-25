import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Glass, Text } from "@rapportini/ui";

const SLIDES = [
  { key: "field", source: require("../../assets/images/login-stove.jpg") as number, caption: "Assistenza tecnica", accent: "#E25B2A" },
  { key: "food", source: require("../../assets/images/login-bar.jpg") as number, caption: "Bar e ristoranti", accent: "#1C6B56" },
];

const SLIDE_MS = 5200;

export function useSlide() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);
  const slide = SLIDES[index] ?? SLIDES[0]!;
  return { index, slide, accent: slide.accent };
}

function KenBurns({ source }: { source: number }) {
  const zoom = useSharedValue(1.04);
  useEffect(() => {
    zoom.value = withRepeat(withTiming(1.16, { duration: SLIDE_MS * 2, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [zoom]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

export function PhotoStage({ index, children }: { index: number; children: ReactNode }) {
  const slide = SLIDES[index] ?? SLIDES[0]!;
  return (
    <View style={{ flex: 1, backgroundColor: "#07080B" }}>
      <Animated.View key={slide.key} entering={FadeIn.duration(1100)} exiting={FadeOut.duration(1100)} style={StyleSheet.absoluteFill}>
        <KenBurns source={slide.source} />
      </Animated.View>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(7,8,11,0.55)", "rgba(7,8,11,0.05)", "rgba(7,8,11,0.55)", "rgba(7,8,11,0.94)"]}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

export function SlideDots({ index }: { index: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Glass tint="dark" rounded={99} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <Animated.View key={index} entering={FadeIn.duration(500)}>
          <Text variant="caption" style={{ color: "#fff", fontWeight: "700" }}>
            {SLIDES[index]?.caption}
          </Text>
        </Animated.View>
      </Glass>
      {SLIDES.map((slide, dot) => (
        <View key={slide.key} style={{ width: dot === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: dot === index ? "#fff" : "rgba(255,255,255,0.4)" }} />
      ))}
    </View>
  );
}

export function BrandMark({ accent, size = 48 }: { accent: string; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <LinearGradient
        colors={[accent, "#FFFFFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1.6, y: 1.6 }}
        style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "#fff", fontSize: size * 0.5, lineHeight: size * 0.62, fontWeight: "800", letterSpacing: -1 }}>B</Text>
      </LinearGradient>
      <Text style={{ color: "#fff", fontSize: size * 0.58, lineHeight: size * 0.72, fontWeight: "700", letterSpacing: -1 }}>Bitora</Text>
    </View>
  );
}
