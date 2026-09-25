import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass } from "./Glass";
import { Text } from "./Text";
import { useTheme } from "./theme";

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * 0.88);
  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(6,7,10,0.42)" }]}>
          <Pressable accessibilityLabel="Chiudi" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View entering={SlideInDown.duration(300).easing(Easing.out(Easing.cubic))} style={{ maxHeight, width: "100%" }}>
          <Glass
            blur
            intensity={80}
            rounded={theme.radius.xl}
            style={{
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              maxHeight,
              padding: 0,
            }}
          >
            <ScrollView
              style={{ maxHeight }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              nestedScrollEnabled
              contentContainerStyle={{
                padding: theme.space.xl,
                paddingBottom: insets.bottom + theme.space.lg,
                gap: theme.space.md,
              }}
            >
              <View style={{ alignSelf: "center", width: 42, height: 5, borderRadius: 99, backgroundColor: theme.colors.inkSoft, opacity: 0.35 }} />
              <Text variant="title">{title}</Text>
              {children}
            </ScrollView>
          </Glass>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
