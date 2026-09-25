import { loginSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Glass, Input, Pressy, Text, ThemeProvider } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { useAuth } from "../../src/auth/store";
import { BrandMark, PhotoStage, SlideDots, useSlide } from "../../src/components/PhotoStage";
import { t } from "../../src/i18n";

const DEMOS = [
  { label: t("demoStove"), email: "marco@stufe.demo" },
  { label: t("demoBar"), email: "giulia@bar.demo" },
];

export default function LoginScreen() {
  const { index, accent } = useSlide();
  return (
    <ThemeProvider accent={accent} scheme="dark">
      <PhotoStage index={index}>
        <LoginForm index={index} accent={accent} />
      </PhotoStage>
    </ThemeProvider>
  );
}

function LoginForm({ index, accent }: { index: number; accent: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useAuth((state) => state.setSession);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const session = await http.post<{ accessToken: string; refreshToken: string; needsOnboarding: boolean }>("/auth/login", values);
    await setSession(session.accessToken, session.refreshToken);
    await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    router.replace(session.needsOnboarding ? "/(onboarding)" : "/");
  });

  function submit() {
    onSubmit().catch((error: Error) => form.setError("root", { message: error.message }));
  }

  function signInDemo(email: string) {
    form.setValue("email", email);
    form.setValue("password", "demo1234");
    submit();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "space-between", paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(600)} style={{ gap: 18 }}>
          <BrandMark accent={accent} size={40} />
        </Animated.View>

        <View style={{ gap: 18 }}>
          <Animated.View entering={FadeInDown.delay(120).duration(700)} style={{ gap: 10 }}>
            <SlideDots index={index} />
            <Text variant="display" style={{ color: "#fff", fontSize: 40, lineHeight: 44 }}>
              {t("tagline")}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).springify().damping(18)}>
            <Glass blur tint="dark" intensity={55} rounded={28} style={{ padding: 18, gap: 14 }}>
              <Text variant="title" style={{ color: "#fff" }}>
                {t("loginTitle")}
              </Text>
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Input
                    label={t("email")}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <Input
                    label={t("password")}
                    secureTextEntry
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              {form.formState.errors.root ? <Text style={{ color: "#FF9A8F" }}>{form.formState.errors.root.message}</Text> : null}
              <Button label={t("login")} loading={form.formState.isSubmitting} onPress={submit} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="caption" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {t("tryDemo")}
                </Text>
                {DEMOS.map((demo) => (
                  <Pressy key={demo.email} onPress={() => signInDemo(demo.email)} style={{ borderRadius: 99 }}>
                    <Glass tint="dark" intensity={30} rounded={99} style={{ paddingHorizontal: 12, paddingVertical: 7, borderColor: "rgba(255,255,255,0.28)" }}>
                      <Text variant="caption" style={{ color: "#fff", fontWeight: "700" }}>
                        {demo.label}
                      </Text>
                    </Glass>
                  </Pressy>
                ))}
              </View>
            </Glass>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(360).duration(600)} style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: "rgba(255,255,255,0.72)" }}>
              {t("noAccount")}{" "}
              <Text style={{ color: "#fff", fontWeight: "700" }} onPress={() => router.push("/(auth)/register")}>
                {t("register")}
              </Text>
            </Text>
            <Text variant="caption" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("developedBy")}
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
