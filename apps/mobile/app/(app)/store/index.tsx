import type { ManifestModule, NeedView } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, Glass, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { daysLeft, formatDate } from "../../../src/billing";
import { Chip } from "../../../src/components/Chip";
import { ModuleIcon } from "../../../src/components/ModuleIcon";
import { can, useManifest } from "../../../src/session";

function Offer({ module, highlighted }: { module: ManifestModule; highlighted: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const inTrial = module.status === "trial";
  const trialUsed = Boolean(module.trialEndsAt) && !inTrial;
  const open = () => router.push({ pathname: "/(app)/store/[key]", params: { key: module.key } });

  return (
    <Pressy onPress={open} style={{ borderRadius: theme.radius.lg }}>
      <Card style={{ gap: 12, borderColor: highlighted ? theme.colors.accent : theme.colors.glassBorder, borderWidth: highlighted ? 1.5 : 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <ModuleIcon name={module.icon} active={inTrial} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{module.label}</Text>
            <Text variant="caption" muted>
              {module.pitch}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.inkSoft} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <Badge label="Modulo aggiuntivo" />
          {inTrial ? (
            <Badge tone="accent" label={`In prova · ${daysLeft(module.trialEndsAt)} giorni`} />
          ) : trialUsed ? (
            <Badge label="Prova già usata" />
          ) : module.trialDays > 0 ? (
            <Badge tone="success" label={`Prova gratis ${module.trialDays} giorni`} />
          ) : null}
        </View>
        {inTrial && module.trialEndsAt ? (
          <Text variant="caption" muted>
            {`In prova fino al ${formatDate(module.trialEndsAt)}.`}
          </Text>
        ) : null}
        <Button tone="secondary" label="Scopri cosa fa" onPress={open} />
      </Card>
    </Pressy>
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
  const modules = manifest.data?.modules ?? [];
  const canManage = can(manifest.data, "settings.manage");
  const included = modules.filter((module) => module.free);
  const owned = modules.filter((module) => !module.free && (module.status === "active" || module.status === "off"));
  const available = modules
    .filter((module) => module.status === "locked" || module.status === "trial")
    .sort((a, b) => Number(b.key === params.module) - Number(a.key === params.module) || b.score - a.score);
  const suggested = available.filter((module) => module.recommended || module.key === params.module || module.status === "trial");
  const others = available.filter((module) => !suggested.includes(module));
  const plan = manifest.data?.plan;

  return (
    <Screen onBack={() => router.back()}>
      <View style={{ gap: 4 }}>
        <Text variant="caption" muted>
          Il tuo piano
        </Text>
        <Text variant="display">{plan?.paidModules ? "Base + moduli" : "Base"}</Text>
        <Text muted>
          {plan?.paidModules
            ? `${plan.paidModules} ${plan.paidModules === 1 ? "modulo aggiuntivo attivo" : "moduli aggiuntivi attivi"}`
            : "Piano base con i moduli essenziali inclusi. Scopri e prova gratis i moduli aggiuntivi."}
        </Text>
      </View>

      <Glass rounded={28} style={{ padding: 18, gap: 12 }}>
        <LinearGradient colors={[theme.colors.accentSoft, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
          <Text variant="heading">Attivi nel tuo piano</Text>
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

      {canManage && manifest.data?.needs.length ? <NeedsCard needs={manifest.data.needs} chosen={manifest.data.tenant.needs} /> : null}

      {available.length ? null : <Text muted>Hai già tutti i moduli attivi.</Text>}
      {suggested.length ? <Text variant="title">Consigliati per te</Text> : null}
      {suggested.map((module) => <Offer key={module.key} module={module} highlighted={module.key === params.module} />)}

      {others.length ? <Text variant="title">Altri moduli</Text> : null}
      {others.map((module) => <Offer key={module.key} module={module} highlighted={false} />)}

      <Text variant="caption" muted style={{ textAlign: "center" }}>
        Prove gratuite senza impegno. Per attivare i moduli aggiuntivi ti contatteremo direttamente.
      </Text>
    </Screen>
  );
}
