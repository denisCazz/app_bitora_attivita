import type { ManifestModule, NeedView } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, Glass, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { daysLeft, monthly, useBillingPortal, useCheckout, useStartTrial } from "../../src/billing";
import { Chip } from "../../src/components/Chip";
import { can, useManifest } from "../../src/session";

function ModuleIcon({ name, active }: { name: string; active?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 15, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accentSoft }}>
      {active ? <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} style={StyleSheet.absoluteFill} /> : null}
      <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={22} color={active ? theme.colors.accentInk : theme.colors.accent} />
    </View>
  );
}

function Offer({ module, highlighted, canBuy }: { module: ManifestModule; highlighted: boolean; canBuy: boolean }) {
  const theme = useTheme();
  const trial = useStartTrial();
  const checkout = useCheckout();
  const [error, setError] = useState("");
  const inTrial = module.status === "trial";
  const trialUsed = Boolean(module.trialEndsAt) && !inTrial;

  function run(action: Promise<unknown>) {
    setError("");
    action.catch((caught: Error) => setError(caught.message));
  }

  return (
    <Card style={{ gap: 12, borderColor: highlighted ? theme.colors.accent : theme.colors.glassBorder, borderWidth: highlighted ? 1.5 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ModuleIcon name={module.icon} active={inTrial} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{module.label}</Text>
          <Text variant="caption" muted>
            {module.pitch}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="heading">{monthly(module.priceCents)}</Text>
        {inTrial ? <Badge tone="accent" label={`Prova · ${daysLeft(module.trialEndsAt)} giorni`} /> : trialUsed ? <Badge label="Prova terminata" /> : null}
      </View>
      {canBuy ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {!inTrial && !trialUsed && module.trialDays > 0 ? (
            <Button style={{ flex: 1 }} tone="secondary" label={`Prova ${module.trialDays} giorni`} loading={trial.isPending} onPress={() => run(trial.mutateAsync(module.key))} />
          ) : null}
          <Button style={{ flex: 1 }} label={inTrial ? "Tienilo" : "Sblocca"} loading={checkout.isPending} onPress={() => run(checkout.mutateAsync([module.key]))} />
        </View>
      ) : (
        <Text variant="caption" muted>
          Chiedi al titolare di sbloccarlo.
        </Text>
      )}
      {error ? (
        <Text variant="caption" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

function NeedsCard({ needs, chosen }: { needs: NeedView[]; chosen: string[] }) {
  const save = useMutation({
    mutationFn: (next: string[]) => http.patch("/settings/needs", { needs: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["manifest"] }),
  });
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="heading">Cosa ti serve?</Text>
      <Text variant="caption" muted>
        Scegli e ti mettiamo in cima i moduli giusti.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {needs.map((need) => (
          <Chip
            key={need.key}
            label={need.label}
            active={chosen.includes(need.key)}
            onPress={() => save.mutate(chosen.includes(need.key) ? chosen.filter((key) => key !== need.key) : [...chosen, need.key])}
          />
        ))}
      </View>
    </Card>
  );
}

export default function StoreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const params = useLocalSearchParams<{ module?: string }>();
  const checkout = useCheckout();
  const portal = useBillingPortal();
  const [portalError, setPortalError] = useState("");
  const modules = manifest.data?.modules ?? [];
  const canBuy = can(manifest.data, "settings.manage");
  const included = modules.filter((module) => module.free);
  const owned = modules.filter((module) => !module.free && (module.status === "active" || module.status === "off"));
  const offers = modules
    .filter((module) => module.status === "locked" || module.status === "trial")
    .sort((a, b) => Number(b.key === params.module) - Number(a.key === params.module) || b.score - a.score);
  const suggested = offers.filter((module) => module.recommended || module.key === params.module || module.status === "trial");
  const others = offers.filter((module) => !suggested.includes(module));
  const bundle = suggested.filter((module) => module.status === "locked");
  const bundleCents = bundle.reduce((sum, module) => sum + module.priceCents, 0);
  const plan = manifest.data?.plan;

  return (
    <Screen onBack={() => router.back()}>
      <View style={{ gap: 4 }}>
        <Text variant="caption" muted>
          Il tuo piano
        </Text>
        <Text variant="display">{plan?.paidModules ? "Base + moduli" : "Base"}</Text>
        <Text muted>
          {plan && (plan.paidModules > 0 || plan.seats.extra > 0)
            ? `${[plan.paidModules ? `${plan.paidModules} moduli` : null, plan.seats.extra ? `${plan.seats.extra} ${plan.seats.extra === 1 ? "utente extra" : "utenti extra"}` : null].filter(Boolean).join(" · ")} · ${monthly(plan.monthlyCents)}`
            : "Gratis, per sempre. 3 utenti inclusi. Aggiungi solo quello che usi."}
        </Text>
        {canBuy && plan && (plan.paidModules > 0 || plan.seats.extra > 0) ? (
          <Button
            tone="secondary"
            label="Gestisci abbonamento"
            loading={portal.isPending}
            onPress={() => {
              setPortalError("");
              portal.mutate(undefined, { onError: (error: Error) => setPortalError(error.message) });
            }}
          />
        ) : null}
        {portalError ? (
          <Text variant="caption" style={{ color: theme.colors.danger }}>
            {portalError}
          </Text>
        ) : null}
      </View>

      <Glass rounded={28} style={{ padding: 18, gap: 12 }}>
        <LinearGradient colors={[theme.colors.accentSoft, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
          <Text variant="heading">Incluso nel Base</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[...included, ...owned].map((module) => (
            <View key={module.key} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: theme.colors.field, borderWidth: 1, borderColor: theme.colors.glassBorder }}>
              <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={14} color={theme.colors.accent} />
              <Text variant="caption" style={{ fontWeight: "700" }}>
                {module.label}
              </Text>
            </View>
          ))}
        </View>
      </Glass>

      {canBuy && manifest.data?.needs.length ? <NeedsCard needs={manifest.data.needs} chosen={manifest.data.tenant.needs} /> : null}

      {offers.length ? null : <Text muted>Hai già tutti i moduli.</Text>}
      {suggested.length ? <Text variant="title">Consigliati per te</Text> : null}
      {suggested.map((module) => (
        <Offer key={module.key} module={module} highlighted={module.key === params.module} canBuy={canBuy} />
      ))}

      {canBuy && bundle.length > 1 ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">Tutti i consigliati</Text>
          <Text muted>
            {bundle.length} moduli · {monthly(bundleCents)}
          </Text>
          <Button label="Sblocca tutto" loading={checkout.isPending} onPress={() => checkout.mutate(bundle.map((module) => module.key))} />
        </Card>
      ) : null}

      {others.length ? <Text variant="title">Altri moduli</Text> : null}
      {others.map((module) => (
        <Offer key={module.key} module={module} highlighted={false} canBuy={canBuy} />
      ))}

      <Text variant="caption" muted style={{ textAlign: "center" }}>
        Pagamento sicuro sul web. Disdici quando vuoi.
      </Text>
    </Screen>
  );
}
