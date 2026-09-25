import type { ManifestModule } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, Glass, Screen, Text, useTheme } from "@rapportini/ui";
import { daysLeft, monthly, useCheckout, useStartTrial } from "../../src/billing";
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
          {!inTrial && !trialUsed ? (
            <Button style={{ flex: 1 }} tone="secondary" label="Prova 14 giorni" loading={trial.isPending} onPress={() => run(trial.mutateAsync(module.key))} />
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

export default function StoreScreen() {
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const params = useLocalSearchParams<{ module?: string }>();
  const checkout = useCheckout();
  const modules = manifest.data?.modules ?? [];
  const canBuy = can(manifest.data, "settings.manage");
  const included = modules.filter((module) => module.free);
  const owned = modules.filter((module) => !module.free && (module.status === "active" || module.status === "off"));
  const offers = modules
    .filter((module) => module.status === "locked" || module.status === "trial")
    .sort((a, b) => Number(b.key === params.module) - Number(a.key === params.module));
  const bundle = offers.filter((module) => module.status === "locked");
  const bundleCents = bundle.reduce((sum, module) => sum + module.priceCents, 0);
  const plan = manifest.data?.plan;

  return (
    <Screen onBack={() => router.back()}>
      <View style={{ gap: 4 }}>
        <Text variant="caption" muted>
          Il tuo piano
        </Text>
        <Text variant="display">{plan?.paidModules ? "Base + moduli" : "Base"}</Text>
        <Text muted>{plan?.paidModules ? `${plan.paidModules} moduli · ${monthly(plan.monthlyCents)}` : "Gratis, per sempre. Aggiungi solo quello che usi."}</Text>
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

      {offers.length ? <Text variant="title">Sblocca</Text> : <Text muted>Hai già tutti i moduli della tua categoria.</Text>}
      {offers.map((module) => (
        <Offer key={module.key} module={module} highlighted={module.key === params.module} canBuy={canBuy} />
      ))}

      {canBuy && bundle.length > 1 ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">Tutto il pacchetto</Text>
          <Text muted>
            {bundle.length} moduli · {monthly(bundleCents)}
          </Text>
          <Button label="Sblocca tutto" loading={checkout.isPending} onPress={() => checkout.mutate(bundle.map((module) => module.key))} />
        </Card>
      ) : null}

      <Text variant="caption" muted style={{ textAlign: "center" }}>
        Pagamento sicuro sul web. Disdici quando vuoi.
      </Text>
    </Screen>
  );
}
