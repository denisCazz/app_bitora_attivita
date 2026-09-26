import { DEFAULT_ACCENT, GENERIC_CATEGORY_KEY, needsFromModules, planModules, type ActivityProposal } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { Button, Card, Input, Pressy, Screen, Text, ThemeProvider, useTheme, withAlpha } from "@rapportini/ui";
import { api, http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { useAuth } from "../../src/auth/store";
import { categoryImageFor } from "../../src/categoryImages";
import { EmployeeForm, type AssignableRole } from "../../src/components/EmployeeForm";
import { defaultTrials, NeedPicker, PlanPreview, type PublicPlan } from "../../src/components/PlanPicker";
import { QueryState } from "../../src/components/States";
import { t } from "../../src/i18n";

interface PublicCategory {
  id: string;
  key: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  image: string | null;
  ownImage?: string | null;
}

type CategoryRoot = PublicCategory & { children: PublicCategory[] };

const CARD_RADIUS = 22;

function CategoryPhoto({ item, active, onPress }: { item: PublicCategory; active: boolean; onPress: () => void }) {
  const source = categoryImageFor(item.key, item.image);
  const icon = item.icon as keyof typeof Ionicons.glyphMap;
  return (
    <Pressy
      scaleTo={0.97}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      style={{ borderRadius: CARD_RADIUS, shadowColor: "#0B0C10", shadowOpacity: active ? 0.28 : 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: active ? 8 : 4 }}
    >
      <View style={{ aspectRatio: 3 / 4, borderRadius: CARD_RADIUS, overflow: "hidden", borderWidth: 2, borderColor: active ? item.accent : "rgba(255,255,255,0.28)", backgroundColor: item.accent }}>
        {source ? (
          <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={250} />
        ) : (
          <LinearGradient colors={[item.accent, "#12141A"]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        {source ? null : <Ionicons name={icon} size={108} color="rgba(255,255,255,0.16)" style={{ position: "absolute", right: -16, bottom: 28 }} />}
        <LinearGradient colors={["rgba(7,8,11,0.22)", "rgba(7,8,11,0)", "rgba(7,8,11,0.15)", "rgba(7,8,11,0.9)"]} locations={[0, 0.28, 0.52, 1]} style={StyleSheet.absoluteFill} />
        <View style={{ position: "absolute", top: 10, left: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.38)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={16} color="#fff" />
        </View>
        {active ? (
          <Animated.View entering={ZoomIn.duration(220)} style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: item.accent, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark" size={16} color="#fff" />
          </Animated.View>
        ) : null}
        <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 12, gap: 2 }}>
          <Text variant="heading" numberOfLines={2} style={{ color: "#fff" }}>
            {item.label}
          </Text>
          {item.description ? (
            <Text variant="caption" numberOfLines={2} style={{ color: "rgba(255,255,255,0.86)" }}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressy>
  );
}

function OtherCard({ active, onPress }: { active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressy scaleTo={0.97} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={t("activityOther")} style={{ borderRadius: CARD_RADIUS }}>
      <View
        style={{
          aspectRatio: 3 / 4,
          borderRadius: CARD_RADIUS,
          borderWidth: 1.5,
          borderColor: active ? theme.colors.accent : theme.colors.line,
          backgroundColor: active ? withAlpha(theme.colors.accent, theme.dark ? 0.22 : 0.1) : theme.colors.field,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 14,
        }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? theme.colors.accent : theme.colors.paperRaised }}>
          <Ionicons name={active ? "checkmark" : "apps-outline"} size={22} color={active ? "#fff" : theme.colors.inkSoft} />
        </View>
        <Text variant="heading" style={{ textAlign: "center" }}>
          {t("activityOther")}
        </Text>
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          {t("activityOtherHint")}
        </Text>
      </View>
    </Pressy>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>{children}</View>;
}

function CardCell({ children }: { children: ReactNode }) {
  return <View style={{ width: "50%", paddingHorizontal: 5, paddingBottom: 10 }}>{children}</View>;
}

function specialtyPhoto(item: PublicCategory): PublicCategory {
  return { ...item, image: "ownImage" in item ? (item.ownImage ?? null) : item.image };
}

export default function OnboardingScreen() {
  const categories = useQuery({ queryKey: ["public-categories"], queryFn: () => http.get<CategoryRoot[]>("/categories"), staleTime: 0 });
  const [rootId, setRootId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [narrowed, setNarrowed] = useState(false);
  const roots = categories.data ?? [];
  const root = roots.find((item) => item.id === rootId);
  const selected = root?.children.find((item) => item.id === categoryId) ?? root;
  return (
    <ThemeProvider accent={selected?.accent ?? DEFAULT_ACCENT}>
      <OnboardingSteps
        roots={roots}
        root={root}
        selected={selected}
        categoryId={categoryId}
        loading={categories.isLoading}
        error={categories.error}
        refetch={() => void categories.refetch()}
        narrowed={narrowed}
        pickRoot={(id) => {
          setRootId(id);
          setCategoryId(null);
          setNarrowed(false);
        }}
        pickCategory={(id) => {
          setCategoryId(id);
          setNarrowed(true);
        }}
      />
    </ThemeProvider>
  );
}

function OnboardingSteps({
  roots,
  root,
  selected,
  categoryId,
  loading: loadingCategories,
  error: categoriesError,
  refetch,
  narrowed,
  pickRoot,
  pickCategory,
}: {
  roots: CategoryRoot[];
  root: CategoryRoot | undefined;
  selected: PublicCategory | undefined;
  categoryId: string | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  narrowed: boolean;
  pickRoot: (id: string) => void;
  pickCategory: (id: string | null) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const setSession = useAuth((state) => state.setSession);
  const [step, setStep] = useState(0);
  const [needs, setNeeds] = useState<string[]>([]);
  const [trialPicks, setTrialPicks] = useState<string[] | null>(null);
  const [brief, setBrief] = useState("");
  const [setup, setSetup] = useState<ActivityProposal | null>(null);
  const [reading, setReading] = useState(false);
  const params = useLocalSearchParams<{ shop?: string }>();
  const [shop, setShop] = useState(typeof params.shop === "string" ? params.shop : "");
  const [city, setCity] = useState("");
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const plan = useQuery({
    queryKey: ["public-plan", selected?.id],
    queryFn: () => http.get<PublicPlan>(`/categories/${selected!.id}/plan`),
    enabled: Boolean(selected) && step >= 1,
  });
  const generic = selected?.key === GENERIC_CATEGORY_KEY;
  const planNeeds = generic ? needsFromModules(needs) : (plan.data?.needs ?? []);
  const suggested: string[] = plan.data ? planModules(plan.data.modules, planNeeds, needs).suggested.map((module) => module.key) : [];
  const trials = (trialPicks ?? (plan.data ? defaultTrials(plan.data, needs) : [])).filter((key) => suggested.includes(key));

  function toggleNeed(key: string) {
    setNeeds((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setTrialPicks(null);
  }

  function toggleTrial(key: string) {
    setTrialPicks(trials.includes(key) ? trials.filter((item) => item !== key) : [...trials, key]);
  }

  function chooseCategory() {
    setNeeds([]);
    setTrialPicks(null);
    setSetup(null);
    setStep(1);
  }

  async function analyze() {
    if (!selected) return;
    setReading(true);
    setError("");
    try {
      const result = await api<ActivityProposal>("POST", `/categories/${selected.id}/setup`, { description: brief.trim() }, { force: true });
      setSetup(result);
      setNeeds(result.modules);
      setTrialPicks(result.trials);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore");
    } finally {
      setReading(false);
    }
  }

  async function createShop() {
    setLoading(true);
    setError("");
    try {
      const created = await http.post<{ accessToken: string; refreshToken: string }>("/tenants", {
        name: shop,
        categoryId: selected?.id,
        city,
        needs: generic ? [] : needs,
        trials,
        ...(generic && setup ? { setup } : {}),
      });
      await setSession(created.accessToken, created.refreshToken);
      const list = await http.get<Array<AssignableRole & { isSystem: boolean }>>("/roles");
      setRoles(list.filter((role) => !role.isSystem));
      setStep(3);
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
    <Screen onBack={step === 1 || step === 2 ? () => setStep(step - 1) : undefined}>
      <Text variant="caption" muted>
        Passo {step + 1} di 4 {selected && step > 0 ? `· ${generic && setup ? setup.activity : selected.label}` : ""}
      </Text>
      {step === 0 ? (
        <View style={{ gap: 12 }}>
          <Text variant="display">{t("onboardingTitle")}</Text>
          <Text muted>{t("activityTypeHint")}</Text>
          <QueryState isLoading={loadingCategories} error={categoriesError} refetch={refetch}>
            <CardGrid>
              {roots.map((item) => (
                <CardCell key={item.id}>
                  <CategoryPhoto item={item} active={root?.id === item.id} onPress={() => pickRoot(item.id)} />
                </CardCell>
              ))}
            </CardGrid>
            {root?.children.length ? (
              <Animated.View key={root.id} entering={FadeIn.duration(220)} style={{ gap: 8 }}>
                <Text variant="heading">{t("activitySpecialty")}</Text>
                <CardGrid>
                  {root.children.map((child) => (
                    <CardCell key={child.id}>
                      <CategoryPhoto item={specialtyPhoto(child)} active={categoryId === child.id} onPress={() => pickCategory(child.id)} />
                    </CardCell>
                  ))}
                  <CardCell>
                    <OtherCard active={narrowed && categoryId === null} onPress={() => pickCategory(null)} />
                  </CardCell>
                </CardGrid>
              </Animated.View>
            ) : null}
          </QueryState>
          <Text variant="caption" muted>
            Piano base gratuito per sempre. I moduli extra si possono provare gratis.
          </Text>
          <Button label={t("continue")} disabled={!selected} onPress={chooseCategory} />
        </View>
      ) : null}
      {step === 1 ? (
        <View style={{ gap: 14 }}>
          <Text variant="display">{generic ? t("genericTitle") : t("needsTitle")}</Text>
          <Text muted>{generic ? t("genericHint") : t("needsHint")}</Text>
          {generic ? (
            <>
              <Input label={t("genericDescribe")} placeholder={t("genericPlaceholder")} multiline value={brief} onChangeText={setBrief} />
              <Button label={t("genericAsk")} tone="secondary" loading={reading} disabled={brief.trim().length < 8} onPress={() => void analyze()} />
              <Text variant="caption" muted>
                {t("genericAiNotice")}
              </Text>
              {setup ? (
                <Card style={{ gap: 6 }}>
                  <Text variant="heading">{setup.activity}</Text>
                  <Text muted>{setup.summary}</Text>
                </Card>
              ) : null}
              {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
            </>
          ) : null}
          <QueryState isLoading={plan.isLoading} error={plan.error} refetch={() => void plan.refetch()}>
            {plan.data && (!generic || setup) ? (
              <>
                {generic ? null : <NeedPicker needs={plan.data.needs} chosen={needs} onToggle={toggleNeed} />}
                <PlanPreview plan={{ ...plan.data, needs: planNeeds }} chosen={needs} trials={trials} onToggleTrial={toggleTrial} />
              </>
            ) : null}
          </QueryState>
          <Button label={trials.length === 1 ? t("continueWithTrial") : trials.length ? t("continueWithTrials").replace("{n}", String(trials.length)) : t("continueFree")} onPress={() => setStep(2)} />
        </View>
      ) : null}
      {step === 2 ? (
        <View style={{ gap: 14 }}>
          <Text variant="display">{t("shopTitle")}</Text>
          <Pressy onPress={() => setStep(0)} accessibilityRole="button" style={{ alignSelf: "flex-start", gap: 2 }}>
            <Text variant="caption" muted>
              {t("onboardingTitle")}
            </Text>
            <Text variant="heading" style={{ color: theme.colors.accent }}>
              {(generic && setup ? setup.activity : selected?.label)} · {t("changeActivity")}
            </Text>
          </Pressy>
          <Input label="Nome attività" value={shop} onChangeText={setShop} />
          <Input label="Città" value={city} onChangeText={setCity} />
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          <Button label="Crea e riempi con esempi" loading={loading} disabled={shop.trim().length < 2} onPress={() => void createShop()} />
        </View>
      ) : null}
      {step === 3 ? (
        <View style={{ gap: 14 }}>
          <Text variant="display">{t("teamTitle")}</Text>
          <Text muted>Tre utenti sono inclusi. Dal quarto, 5€ al mese per utente. Puoi aggiungerli anche dopo, da Altro › Dipendenti.</Text>
          <EmployeeForm roles={roles} />
          <Button label="Apri l'app" tone="secondary" onPress={() => void finish()} />
        </View>
      ) : null}
    </Screen>
  );
}
