import { loginSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Glass, Input, Pressy, Text, ThemeProvider } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { offerBiometric } from "../../src/auth/biometric";
import { forgetRememberedUser, loadRememberedUser, rememberUser, useAuth, type RememberedUser } from "../../src/auth/store";
import { BrandMark, PhotoStage, SlideDots, useSlide } from "../../src/components/PhotoStage";
import { SocialButtons, type SignInSession } from "../../src/components/SocialButtons";
import { t } from "../../src/i18n";
import { openLegal } from "../../src/legal";

const DEMOS = [
  { label: t("demoStove"), email: "marco@stufe.demo", category: "stoves" },
  { label: t("demoBoiler"), email: "luca@caldaie.demo", category: "boilers" },
  { label: t("demoHvac"), email: "nina@clima.demo", category: "hvac" },
  { label: t("demoPlumbing"), email: "paolo@idraulica.demo", category: "plumbing" },
  { label: t("demoElectrical"), email: "davide@elettrico.demo", category: "electrical" },
  { label: t("demoSolar"), email: "sofia@fotovoltaico.demo", category: "solar" },
  { label: t("demoCarpentry"), email: "enzo@falegname.demo", category: "carpentry" },
  { label: t("demoMechanic"), email: "leo@officina.demo", category: "mechanic" },
  { label: t("demoGarden"), email: "rosa@giardini.demo", category: "garden" },
  { label: t("demoBar"), email: "giulia@bar.demo", category: "bar" },
  { label: t("demoRestaurant"), email: "andrea@ristorante.demo", category: "restaurant" },
  { label: t("demoGelato"), email: "alice@gelato.demo", category: "gelato" },
  { label: t("demoBakery"), email: "chiara@forno.demo", category: "bakery" },
  { label: t("demoNails"), email: "sara@unghie.demo", category: "nails" },
  { label: t("demoHair"), email: "elena@salone.demo", category: "hair" },
  { label: t("demoSpa"), email: "laura@spa.demo", category: "spa" },
  { label: t("demoBarber"), email: "pietro@barbiere.demo", category: "barber" },
  { label: t("demoGym"), email: "mia@palestra.demo", category: "gym" },
  { label: t("demoLaundry"), email: "anna@lavanderia.demo", category: "laundry" },
  { label: t("demoFlorist"), email: "viola@fiori.demo", category: "florist" },
];

export default function LoginScreen() {
  const { index, accent, slide } = useSlide();
  return (
    <ThemeProvider accent={accent} scheme="dark">
      <PhotoStage index={index}>
        <LoginForm index={index} accent={accent} slideKey={slide.key} />
      </PhotoStage>
    </ThemeProvider>
  );
}

function LoginForm({ index, accent, slideKey }: { index: number; accent: string; slideKey: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useAuth((state) => state.setSession);
  const [demoEmail, setDemoEmail] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<RememberedUser | null | undefined>(undefined);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    void loadRememberedUser().then((user) => {
      if (user) form.setValue("email", user.email);
      setRemembered(user);
    });
  }, [form]);

  async function enter(session: SignInSession, { demo = false } = {}) {
    await setSession(session.accessToken, session.refreshToken);
    if (!demo) await rememberUser(session.user);
    await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    if (session.user.platformAdmin && !session.activeTenantId) router.replace("/(app)/admin");
    else router.replace(session.needsOnboarding ? "/(onboarding)" : "/");
    if (!demo) void offerBiometric();
  }

  function notMe() {
    void forgetRememberedUser();
    setRemembered(null);
    form.reset({ email: "", password: "" });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    await enter(await http.post<SignInSession>("/auth/login", values));
  });

  function submit() {
    onSubmit().catch((error: Error) => form.setError("root", { message: error.message }));
  }

  function signInDemo(email: string) {
    if (demoEmail) return;
    setDemoEmail(email);
    form.clearErrors("root");
    http
      .post<SignInSession>("/auth/demo", { email })
      .then((session) => enter(session, { demo: true }))
      .catch((error: Error) => form.setError("root", { message: error.message }))
      .finally(() => setDemoEmail(null));
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

          {remembered === undefined ? null : (
            <Animated.View entering={FadeInDown.delay(240).springify().damping(18)}>
              <Glass blur tint="dark" intensity={55} rounded={28} style={{ padding: 18, gap: 14 }}>
                {remembered ? (
                  <View style={{ gap: 4 }}>
                    <Text variant="title" style={{ color: "#fff" }}>
                      {t("welcomeBack").replace("{name}", remembered.name.split(" ")[0] ?? remembered.name)}
                    </Text>
                    <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.7)" }}>
                      {remembered.email}
                    </Text>
                  </View>
                ) : (
                  <Text variant="title" style={{ color: "#fff" }}>
                    {t("loginTitle")}
                  </Text>
                )}
                {remembered ? null : (
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
                )}
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
                <SocialButtons
                  mode="signin"
                  onSession={enter}
                  onError={(message) => (message ? form.setError("root", { message }) : form.clearErrors("root"))}
                />
                {remembered ? (
                  <Text style={{ color: "rgba(255,255,255,0.72)", textAlign: "center" }}>
                    {t("notYou")}{" "}
                    <Text accessibilityRole="link" style={{ color: "#fff", fontWeight: "700" }} onPress={notMe}>
                      {t("signInOther")}
                    </Text>
                  </Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    <Text variant="caption" style={{ color: "rgba(255,255,255,0.6)" }}>
                      {t("tryDemo")}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                      {DEMOS.map((demo) => {
                        const current = demo.category === slideKey;
                        return (
                          <Pressy key={demo.email} disabled={demoEmail !== null} onPress={() => signInDemo(demo.email)} style={{ borderRadius: 99, opacity: demoEmail && demoEmail !== demo.email ? 0.45 : 1 }}>
                            <Glass tint="dark" intensity={current ? 50 : 30} rounded={99} style={{ paddingHorizontal: 12, paddingVertical: 7, borderColor: current ? "#fff" : "rgba(255,255,255,0.28)" }}>
                              <Text variant="caption" style={{ color: "#fff", fontWeight: "700" }}>
                                {demoEmail === demo.email ? "…" : demo.label}
                              </Text>
                            </Glass>
                          </Pressy>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </Glass>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(360).duration(600)} style={{ alignItems: "center", gap: 10 }}>
            {remembered === null ? (
              <View style={{ alignSelf: "stretch", gap: 8 }}>
                <Text style={{ color: "rgba(255,255,255,0.72)", textAlign: "center" }}>{t("noAccount")}</Text>
                <Button tone="secondary" label={t("registerCta")} onPress={() => router.push("/(auth)/register")} />
              </View>
            ) : null}
            <Text variant="caption" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("developedBy")} ·{" "}
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.7)" }} onPress={() => void openLegal("privacy")}>
                Privacy
              </Text>{" "}
              ·{" "}
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.7)" }} onPress={() => void openLegal("terms")}>
                Termini
              </Text>
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
