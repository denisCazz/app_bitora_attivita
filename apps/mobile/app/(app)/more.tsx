import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, ListItem, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { useAuth } from "../../src/auth/store";
import { daysLeft, monthly } from "../../src/billing";
import { t } from "../../src/i18n";
import { useManifest } from "../../src/session";

export default function MoreScreen() {
  const manifest = useManifest();
  const theme = useTheme();
  const router = useRouter();
  const clear = useAuth((state) => state.clear);
  const setSession = useAuth((state) => state.setSession);
  const terms = manifest.data?.tenant.terminology;
  const tabs = new Set((manifest.data?.navigation ?? []).map((item) => item.key));
  const modules = (manifest.data?.modules ?? []).filter((module) => module.key !== "dashboard" && module.status !== "off");
  const open = modules.filter((module) => module.status !== "locked" && !tabs.has(module.key));
  const locked = modules.filter((module) => module.status === "locked");

  function titleOf(key: string, label: string) {
    if (key === "work_orders") return terms?.workOrders ?? label;
    if (key === "assets") return terms?.assets ?? label;
    return label;
  }

  async function logout() {
    await clear();
    queryClient.clear();
    router.replace("/(auth)/login");
  }

  async function switchTenant(tenantId: string) {
    const session = await http.post<{ accessToken: string; refreshToken: string }>("/me/tenant", { tenantId });
    await setSession(session.accessToken, session.refreshToken);
    queryClient.clear();
    router.replace("/");
  }

  return (
    <Screen>
      <Text variant="display">Altro</Text>

      <Pressy onPress={() => router.push("/(app)/store")} style={{ borderRadius: theme.radius.lg }}>
        <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", padding: 18, gap: 6 }}>
          <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text variant="heading" style={{ color: "#fff" }}>
              Store moduli
            </Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.88)" }}>
            {locked.length ? `${locked.length} moduli da sbloccare, con prova gratuita.` : "Hai sbloccato tutto. Gestisci il tuo piano."}
          </Text>
        </View>
      </Pressy>

      {open.length ? (
        <Card>
          {open.map((module) => (
            <ListItem
              key={module.key}
              title={titleOf(module.key, module.label)}
              subtitle={module.status === "trial" ? `In prova · ${daysLeft(module.trialEndsAt)} giorni` : module.description}
              leading={<Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={20} color={theme.colors.accent} />}
              onPress={() => router.push(`/(app)${module.route}` as never)}
            />
          ))}
        </Card>
      ) : null}

      {locked.length ? (
        <View style={{ gap: 8 }}>
          <Text variant="title">Da sbloccare</Text>
          <Card>
            {locked.map((module) => (
              <ListItem
                key={module.key}
                title={titleOf(module.key, module.label)}
                subtitle={module.pitch}
                leading={<Ionicons name="lock-closed" size={18} color={theme.colors.accent} />}
                trailing={<Badge label={monthly(module.priceCents)} />}
                onPress={() => router.push({ pathname: "/(app)/store", params: { module: module.key } })}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {manifest.data?.user.platformAdmin && !manifest.data.user.email.endsWith(".demo") ? (
        <Card style={{ paddingVertical: 4 }}>
          <ListItem
            title="Console Bitora"
            subtitle="Utenti, personalizzazioni, categorie e prezzi"
            leading={<Ionicons name="planet-outline" size={20} color={theme.colors.accent} />}
            onPress={() => router.push("/(app)/admin")}
          />
        </Card>
      ) : null}

      {(manifest.data?.memberships.length ?? 0) > 1 ? (
        <View style={{ gap: 8 }}>
          <Text variant="title">Negozi</Text>
          {manifest.data?.memberships.map((membership) => (
            <Button key={membership.tenantId} label={`${membership.tenantName} · ${membership.roleName}`} tone="secondary" onPress={() => void switchTenant(membership.tenantId)} />
          ))}
        </View>
      ) : null}
      <Button label={t("logout")} tone="ghost" onPress={() => void logout()} />
    </Screen>
  );
}
