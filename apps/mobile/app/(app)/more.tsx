import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Pressy, Screen, Text, useTheme, withAlpha } from "@rapportini/ui";
import { signOut } from "../../src/account";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { useAuth } from "../../src/auth/store";
import { daysLeft, monthly } from "../../src/billing";
import { t } from "../../src/i18n";
import { can, modulePermitted, useManifest } from "../../src/session";

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || name.slice(0, 2).toUpperCase() || "?";
}

function glyph(name: string): keyof typeof Ionicons.glyphMap {
  return name in Ionicons.glyphMap ? (name as keyof typeof Ionicons.glyphMap) : "apps-outline";
}

function IconWell({ name, tone = "accent" }: { name: keyof typeof Ionicons.glyphMap; tone?: "accent" | "muted" | "danger" }) {
  const theme = useTheme();
  const color = tone === "danger" ? theme.colors.danger : tone === "muted" ? theme.colors.inkSoft : theme.colors.accent;
  return (
    <View style={{ width: 46, height: 46, borderRadius: 16, borderCurve: "continuous", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      <LinearGradient
        colors={[withAlpha(color, theme.dark ? 0.34 : 0.2), withAlpha(color, theme.dark ? 0.1 : 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={name} size={21} color={color} />
    </View>
  );
}

function Chevron() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.dark ? "rgba(255,255,255,0.06)" : "rgba(18,19,24,0.05)",
      }}
    >
      <Ionicons name="chevron-forward" size={15} color={theme.colors.inkSoft} />
    </View>
  );
}

function Menu({ children }: { children: ReactNode }) {
  return <Card style={{ padding: 6, gap: 2 }}>{children}</Card>;
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  tone = "accent",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  tone?: "accent" | "muted" | "danger";
}) {
  return (
    <Pressy
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={!onPress}
      scaleTo={onPress ? 0.985 : 1}
      haptic={onPress ? "light" : "none"}
      onPress={onPress}
      style={{ borderRadius: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 18 }}>
        <IconWell name={icon} tone={tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" muted numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing}
        {onPress ? <Chevron /> : null}
      </View>
    </Pressy>
  );
}

export default function MoreScreen() {
  const manifest = useManifest();
  const theme = useTheme();
  const router = useRouter();
  const setSession = useAuth((state) => state.setSession);
  const terms = manifest.data?.tenant.terminology;
  const tabs = new Set((manifest.data?.navigation ?? []).map((item) => item.key));
  const modules = (manifest.data?.modules ?? []).filter(
    (module) => module.key !== "dashboard" && module.status !== "off" && modulePermitted(manifest.data, module.key),
  );
  const open = modules.filter((module) => module.status !== "locked" && !tabs.has(module.key));
  const locked = modules.filter((module) => module.status === "locked");
  const name = manifest.data?.user.name ?? "Profilo";
  const email = manifest.data?.user.email;
  const role = manifest.data?.role.name;
  const showTeam = Boolean(manifest.data?.managesPeople) || can(manifest.data, "team.manage");
  const showSettings = can(manifest.data, "settings.manage");

  function titleOf(key: string, label: string) {
    if (key === "work_orders") return terms?.workOrders ?? label;
    if (key === "assets") return terms?.assets ?? label;
    return label;
  }

  async function logout() {
    await signOut();
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

      <Pressy accessibilityRole="button" accessibilityLabel="Profilo e account" onPress={() => router.push("/(app)/profile")} style={{ borderRadius: theme.radius.xl }}>
        <Card style={{ padding: 0, borderRadius: theme.radius.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16 }}>
            <LinearGradient
              colors={[withAlpha(theme.colors.accent, theme.dark ? 0.32 : 0.16), "transparent"]}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 0.85, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ width: 72, height: 72, borderRadius: 36, padding: 3, backgroundColor: withAlpha(theme.colors.accent, theme.dark ? 0.35 : 0.22) }}>
              <View style={{ flex: 1, borderRadius: 33, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={["rgba(255,255,255,0.38)", "rgba(255,255,255,0)"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 0.9 }} style={StyleSheet.absoluteFill} />
                <Text style={{ color: "#fff", fontSize: 24, lineHeight: 28, fontWeight: "700", letterSpacing: -0.6 }}>{initials(name)}</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title" numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" muted numberOfLines={1}>
                {email ?? "Profilo e account"}
              </Text>
              {role ? (
                <View style={{ alignSelf: "flex-start", marginTop: 6, borderRadius: 99, backgroundColor: theme.colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: "700" }}>
                    {role}
                  </Text>
                </View>
              ) : null}
            </View>
            <Chevron />
          </View>
        </Card>
      </Pressy>

      <Pressy accessibilityRole="button" accessibilityLabel="Store moduli" onPress={() => router.push("/(app)/store")} style={{ borderRadius: theme.radius.lg }}>
        <View style={{ borderRadius: theme.radius.lg, borderCurve: "continuous", overflow: "hidden", flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
          <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={StyleSheet.absoluteFill} />
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              borderCurve: "continuous",
              backgroundColor: "rgba(255,255,255,0.2)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.28)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" style={{ color: "#fff" }}>
              Store moduli
            </Text>
            <Text variant="caption" style={{ color: "rgba(255,255,255,0.88)" }}>
              {locked.length ? `${locked.length} moduli da sbloccare, con prova gratuita.` : "Hai sbloccato tutto. Gestisci il tuo piano."}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.92)" />
        </View>
      </Pressy>

      {showTeam || showSettings ? (
        <View style={{ gap: 8 }}>
          <Text variant="title">Gestione</Text>
          <Menu>
            {showTeam ? (
              <MenuRow
                icon="people-outline"
                title="Dipendenti"
                subtitle={manifest.data?.managesPeople ? "Aggiungi dipendenti e amministratori" : "Chi lavora nel negozio"}
                onPress={() => router.push("/(app)/settings/team")}
              />
            ) : null}
            {showSettings ? (
              <MenuRow icon="settings-outline" title="Impostazioni" subtitle="Logo, ruoli, campi, moduli e incassi" onPress={() => router.push("/(app)/settings")} />
            ) : null}
          </Menu>
        </View>
      ) : null}

      {open.length ? (
        <Menu>
          {open.map((module) => (
            <MenuRow
              key={module.key}
              icon={glyph(module.icon)}
              title={titleOf(module.key, module.label)}
              subtitle={module.status === "trial" ? `In prova · ${daysLeft(module.trialEndsAt)} giorni` : module.description}
              onPress={() => router.push(`/(app)${module.route}` as never)}
            />
          ))}
        </Menu>
      ) : null}

      {locked.length ? (
        <View style={{ gap: 8 }}>
          <Text variant="title">Da sbloccare</Text>
          <Menu>
            {locked.map((module) => (
              <MenuRow
                key={module.key}
                icon={glyph(module.icon)}
                tone="muted"
                title={titleOf(module.key, module.label)}
                subtitle={module.pitch}
                trailing={<Badge label={monthly(module.priceCents)} />}
                onPress={() => router.push({ pathname: "/(app)/store", params: { module: module.key } })}
              />
            ))}
          </Menu>
        </View>
      ) : null}

      {manifest.data?.user.platformAdmin && !manifest.data.user.email.endsWith(".demo") ? (
        <Menu>
          <MenuRow
            icon="planet-outline"
            title="Console Bitora"
            subtitle="Utenti, personalizzazioni, categorie e prezzi"
            onPress={() => router.push("/(app)/admin")}
          />
        </Menu>
      ) : null}

      {(manifest.data?.memberships.length ?? 0) > 1 ? (
        <View style={{ gap: 8 }}>
          <Text variant="title">Negozi</Text>
          <Menu>
            {manifest.data?.memberships.map((membership) => {
              const current = membership.tenantId === manifest.data?.tenant.id;
              return (
                <MenuRow
                  key={membership.tenantId}
                  icon="storefront-outline"
                  title={membership.tenantName}
                  subtitle={membership.roleName}
                  tone={current ? "accent" : "muted"}
                  trailing={current ? <Ionicons name="checkmark-circle" size={22} color={theme.colors.accent} /> : undefined}
                  onPress={current ? undefined : () => void switchTenant(membership.tenantId)}
                />
              );
            })}
          </Menu>
        </View>
      ) : null}

      <Pressy accessibilityRole="button" accessibilityLabel={t("logout")} onPress={() => void logout()} style={{ borderRadius: theme.radius.md }}>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 }}>
          <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
          <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>{t("logout")}</Text>
        </Card>
      </Pressy>
    </Screen>
  );
}
