import { DEFAULT_ACCENT } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { Button, Input, Pressy, Screen, Text, ThemeProvider, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { useAuth } from "../../src/auth/store";
import { categoryImage } from "../../src/categoryImages";
import { Chip } from "../../src/components/Chip";
import { QueryState } from "../../src/components/States";
import { t } from "../../src/i18n";

interface PublicCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  image: string | null;
}

type CategoryRoot = PublicCategory & { children: PublicCategory[] };

export default function OnboardingScreen() {
  const categories = useQuery({ queryKey: ["public-categories"], queryFn: () => http.get<CategoryRoot[]>("/categories"), staleTime: 0 });
  const [rootId, setRootId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const roots = categories.data ?? [];
  const root = roots.find((item) => item.id === rootId) ?? roots[0];
  const selected = root?.children.find((item) => item.id === categoryId) ?? root;
  return (
    <ThemeProvider accent={selected?.accent ?? DEFAULT_ACCENT}>
      <OnboardingSteps
        roots={roots}
        root={root}
        selected={selected}
        loading={categories.isLoading}
        error={categories.error}
        refetch={() => void categories.refetch()}
        pickRoot={(id) => {
          setRootId(id);
          setCategoryId(null);
        }}
        pickCategory={setCategoryId}
      />
    </ThemeProvider>
  );
}

function OnboardingSteps({
  roots,
  root,
  selected,
  loading: loadingCategories,
  error: categoriesError,
  refetch,
  pickRoot,
  pickCategory,
}: {
  roots: CategoryRoot[];
  root: CategoryRoot | undefined;
  selected: PublicCategory | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  pickRoot: (id: string) => void;
  pickCategory: (id: string | null) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const setSession = useAuth((state) => state.setSession);
  const [step, setStep] = useState(0);
  const [shop, setShop] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [roleId, setRoleId] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createShop() {
    setLoading(true);
    setError("");
    try {
      const created = await http.post<{ accessToken: string; refreshToken: string }>("/tenants", { name: shop, categoryId: selected?.id, city, withSample: true });
      await setSession(created.accessToken, created.refreshToken);
      const list = await http.get<Array<{ id: string; name: string }>>("/roles");
      setRoles(list.filter((role) => role.name !== "Titolare"));
      setRoleId(list.find((role) => role.name !== "Titolare")?.id ?? "");
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function sendInvite() {
    if (!email || !roleId) return finish();
    setLoading(true);
    try {
      const result = await http.post<{ token: string }>("/team/invites", { email, roleId });
      setInvite(result.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    router.replace("/");
  }

  return (
    <Screen onBack={step === 1 ? () => setStep(0) : undefined}>
      <Text variant="caption" muted>
        Passo {step + 1} di 3 {selected && step > 0 ? `· ${selected.label}` : ""}
      </Text>
      {step === 0 ? (
        <View style={{ gap: 12 }}>
          <Text variant="display">{t("onboardingTitle")}</Text>
          <Text muted>L'app si adatta: moduli, ruoli e parole cambiano con la categoria.</Text>
          <QueryState isLoading={loadingCategories} error={categoriesError} refetch={refetch}>
            {roots.map((item) => {
              const active = root?.id === item.id;
              const source = categoryImage(item.image);
              return (
                <Pressy key={item.id} scaleTo={0.97} onPress={() => pickRoot(item.id)} style={{ borderRadius: 28 }}>
                  <View style={{ height: 170, borderRadius: 28, overflow: "hidden", borderWidth: 3, borderColor: active ? item.accent : "transparent", backgroundColor: item.accent }}>
                    {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : null}
                    <LinearGradient colors={["rgba(7,8,11,0)", "rgba(7,8,11,0.85)"]} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
                    <View style={{ flex: 1, justifyContent: "flex-end", padding: 16, gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={22} color="#fff" />
                        <Text variant="title" style={{ color: "#fff" }}>
                          {item.label}
                        </Text>
                      </View>
                      <Text style={{ color: "rgba(255,255,255,0.8)" }}>{item.description}</Text>
                    </View>
                    {active ? (
                      <Animated.View entering={ZoomIn.duration(220)} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: 15, backgroundColor: item.accent, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </Animated.View>
                    ) : null}
                  </View>
                </Pressy>
              );
            })}
            {root?.children.length ? (
              <Animated.View key={root.id} entering={FadeIn.duration(220)} style={{ gap: 8 }}>
                <Text variant="heading">Di cosa ti occupi?</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {root.children.map((child) => (
                    <Chip key={child.id} label={child.label} tone={child.accent} active={selected?.id === child.id} onPress={() => pickCategory(child.id)} />
                  ))}
                  <Chip label="Altro" active={selected?.id === root.id} onPress={() => pickCategory(null)} />
                </View>
                {selected?.description ? (
                  <Text variant="caption" muted>
                    {selected.description}
                  </Text>
                ) : null}
              </Animated.View>
            ) : null}
          </QueryState>
          <Text variant="caption" muted>
            Piano base gratuito per sempre. I moduli extra si possono provare gratis.
          </Text>
          <Button label={t("continue")} disabled={!selected} onPress={() => setStep(1)} />
        </View>
      ) : null}
      {step === 1 ? (
        <View style={{ gap: 14 }}>
          <Text variant="display">{t("shopTitle")}</Text>
          <Input label="Nome attività" value={shop} onChangeText={setShop} />
          <Input label="Città" value={city} onChangeText={setCity} />
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          <Button label="Crea e riempi con esempi" loading={loading} disabled={shop.trim().length < 2} onPress={() => void createShop()} />
        </View>
      ) : null}
      {step === 2 ? (
        <View style={{ gap: 14 }}>
          <Text variant="display">{t("teamTitle")}</Text>
          <Text muted>Invita una persona. Puoi farlo anche dopo, dalle impostazioni.</Text>
          <Input label={t("email")} autoCapitalize="none" value={email} onChangeText={setEmail} />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {roles.map((role) => (
              <Button key={role.id} label={role.name} tone={roleId === role.id ? "primary" : "secondary"} onPress={() => setRoleId(role.id)} />
            ))}
          </View>
          {invite ? <Text>Codice invito: {invite}</Text> : null}
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          <Button label="Invia invito" tone="secondary" loading={loading} onPress={() => void sendInvite()} />
          <Button label="Apri l'app" onPress={() => void finish()} />
        </View>
      ) : null}
    </Screen>
  );
}
