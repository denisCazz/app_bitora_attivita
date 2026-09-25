import { useQuery } from "@tanstack/react-query";
import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Glass, Text } from "@rapportini/ui";
import { http } from "../api/client";
import { categoryImageFor } from "../categoryImages";

interface Slide {
  key: string;
  source: ImageSource | number;
  caption: string;
  accent: string;
}

const FALLBACK_SLIDES: Slide[] = [
  { key: "stoves", source: require("../../assets/images/login-stove.jpg") as number, caption: "Stufe e camini", accent: "#E25B2A" },
  { key: "boilers", source: require("../../assets/images/login-boiler.jpg") as number, caption: "Caldaie", accent: "#D9480F" },
  { key: "hvac", source: require("../../assets/images/login-hvac.jpg") as number, caption: "Climatizzazione", accent: "#0EA5E9" },
  { key: "plumbing", source: require("../../assets/images/login-plumber.jpg") as number, caption: "Idraulici", accent: "#0E7490" },
  { key: "electrical", source: require("../../assets/images/login-electrician.jpg") as number, caption: "Elettricisti", accent: "#CA8A04" },
  { key: "solar", source: require("../../assets/images/login-solar.jpg") as number, caption: "Fotovoltaico", accent: "#F59E0B" },
  { key: "carpentry", source: require("../../assets/images/login-carpenter.jpg") as number, caption: "Falegnami", accent: "#92400E" },
  { key: "mechanic", source: require("../../assets/images/login-mechanic.jpg") as number, caption: "Officine", accent: "#334155" },
  { key: "garden", source: require("../../assets/images/login-garden.jpg") as number, caption: "Giardinieri", accent: "#3F6212" },
  { key: "bar", source: require("../../assets/images/login-bar.jpg") as number, caption: "Bar e caffetterie", accent: "#1C6B56" },
  { key: "restaurant", source: require("../../assets/images/login-restaurant.jpg") as number, caption: "Ristoranti e pizzerie", accent: "#B4431E" },
  { key: "gelato", source: require("../../assets/images/login-gelato.jpg") as number, caption: "Gelaterie", accent: "#E11D48" },
  { key: "bakery", source: require("../../assets/images/login-bakery.jpg") as number, caption: "Pasticcerie", accent: "#C2410C" },
  { key: "nails", source: require("../../assets/images/login-nails.jpg") as number, caption: "Unghie", accent: "#DB2777" },
  { key: "hair", source: require("../../assets/images/login-hair.jpg") as number, caption: "Parrucchieri", accent: "#6D28D9" },
  { key: "spa", source: require("../../assets/images/login-spa.jpg") as number, caption: "Spa e centri estetici", accent: "#0F766E" },
  { key: "barber", source: require("../../assets/images/login-barber.jpg") as number, caption: "Barbieri", accent: "#7C2D12" },
  { key: "gym", source: require("../../assets/images/login-gym.jpg") as number, caption: "Palestre", accent: "#EA580C" },
  { key: "laundry", source: require("../../assets/images/login-laundry.jpg") as number, caption: "Lavanderie", accent: "#0369A1" },
  { key: "florist", source: require("../../assets/images/login-florist.jpg") as number, caption: "Fiorai", accent: "#BE185D" },
];

const SLIDE_MS = 5200;

interface PublicCategory {
  id: string;
  key: string;
  label: string;
  accent: string;
  image: string | null;
  ownImage?: string | null;
  children?: PublicCategory[];
}

function useSlides(): Slide[] {
  const categories = useQuery({
    queryKey: ["public-categories"],
    queryFn: () => http.get<PublicCategory[]>("/categories"),
    staleTime: 5 * 60_000,
  });
  const slides = (categories.data ?? []).flatMap((root) => {
    const children = root.children ?? [];
    const items = children.length ? children : [root];
    return items.flatMap((item) => {
      const source = categoryImageFor(item.key, children.length ? item.ownImage : item.image);
      return source ? [{ key: item.key, source, caption: item.label, accent: item.accent }] : [];
    });
  });
  return slides.length ? slides : FALLBACK_SLIDES;
}

function slideAt(slides: Slide[], index: number): Slide {
  return slides[index % slides.length] ?? slides[0]!;
}

export function useSlide() {
  const slides = useSlides();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => current + 1), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);
  const slide = slideAt(slides, index);
  return { index, slide, accent: slide.accent };
}

function KenBurns({ source }: { source: ImageSource | number }) {
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
  const slide = slideAt(useSlides(), index);
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
  const slides = useSlides();
  const current = slideAt(slides, index);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Glass tint="dark" rounded={99} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <Animated.View key={current.key} entering={FadeIn.duration(500)}>
          <Text variant="caption" style={{ color: "#fff", fontWeight: "700" }}>
            {current.caption}
          </Text>
        </Animated.View>
      </Glass>
      <Text variant="caption" style={{ color: "rgba(255,255,255,0.72)" }}>
        {(index % slides.length) + 1}/{slides.length}
      </Text>
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
