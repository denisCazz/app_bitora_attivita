import { registerSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Glass, Input, Text, ThemeProvider } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { useAuth } from "../../src/auth/store";
import { BrandMark, PhotoStage, useSlide } from "../../src/components/PhotoStage";
import { t } from "../../src/i18n";

export default function RegisterScreen() {
  const { index, accent } = useSlide();
  return (
    <ThemeProvider accent={accent} scheme="dark">
      <PhotoStage index={index}>
        <RegisterForm accent={accent} />
      </PhotoStage>
    </ThemeProvider>
  );
}

function RegisterForm({ accent }: { accent: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useAuth((state) => state.setSession);
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const session = await http.post<{ accessToken: string; refreshToken: string }>("/auth/register", values);
    await setSession(session.accessToken, session.refreshToken);
    router.replace("/(onboarding)");
  });

  function submit() {
    onSubmit().catch((error: Error) => form.setError("root", { message: error.message }));
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "space-between", paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(600)}>
          <BrandMark accent={accent} size={40} />
        </Animated.View>
        <View style={{ gap: 18 }}>
          <Animated.View entering={FadeInDown.delay(120).duration(700)} style={{ gap: 8 }}>
            <Text variant="display" style={{ color: "#fff", fontSize: 40, lineHeight: 44 }}>
              {t("registerTitle")}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.75)" }}>{t("registerSubtitle")}</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(240).springify().damping(18)}>
            <Glass blur tint="dark" intensity={55} rounded={28} style={{ padding: 18, gap: 14 }}>
              <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label={t("name")} autoComplete="name" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Input label={t("email")} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
                )}
              />
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <Input label={t("password")} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
                )}
              />
              {form.formState.errors.root ? <Text style={{ color: "#FF9A8F" }}>{form.formState.errors.root.message}</Text> : null}
              <Button label={t("continue")} loading={form.formState.isSubmitting} onPress={submit} />
            </Glass>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(360).duration(600)} style={{ alignItems: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.72)" }}>
              {t("haveAccount")}{" "}
              <Text style={{ color: "#fff", fontWeight: "700" }} onPress={() => router.back()}>
                {t("login")}
              </Text>
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
