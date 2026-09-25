import { isUsable } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { monthly, useLockedModules } from "../../src/billing";
import { QueryState } from "../../src/components/States";
import { when } from "../../src/format";
import { useNotices } from "../../src/notices";
import { useManifest } from "../../src/session";

interface Dashboard {
  openWorkOrders: number;
  openOrders: number;
  lowStock: number;
  dueSoon: Array<{ id: string; title: string; dueAt: string; kind: string }>;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default function HomeScreen() {
  const theme = useTheme();
  const manifest = useManifest();
  const router = useRouter();
  const terms = manifest.data?.tenant.terminology;
  const moduleOf = (key: string) => manifest.data?.modules.find((module) => module.key === key);
  const usable = (key: string) => {
    const module = moduleOf(key);
    return module ? isUsable(module.status) : false;
  };
  const offer = useLockedModules().find((module) => module.status === "locked" && module.recommended);
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => http.get<Dashboard>("/dashboard"), enabled: Boolean(manifest.data) });
  const notices = useNotices(Boolean(manifest.data));
  const unread = (notices.data ?? []).filter((notice) => !notice.readAt).length;

  const available: Record<string, { module: string; label: string; value: number; icon: string }> = {
    openWorkOrders: { module: "work_orders", label: `${terms?.workOrders ?? moduleOf("work_orders")?.label ?? ""} in corso`, value: dashboard.data?.openWorkOrders ?? 0, icon: "construct-outline" },
    openOrders: { module: "orders", label: `${moduleOf("orders")?.label ?? ""} in corso`, value: dashboard.data?.openOrders ?? 0, icon: "receipt-outline" },
    lowStock: { module: "spare_parts", label: `${terms?.spareParts ?? moduleOf("spare_parts")?.label ?? ""} sotto scorta`, value: dashboard.data?.lowStock ?? 0, icon: "cube-outline" },
  };
  const configured = manifest.data?.tenant.vocab.dashboard ?? [];
  const order = [...configured, ...Object.keys(available).filter((key) => !configured.includes(key))];
  const stats = order
    .flatMap((key) => (available[key] ? [{ key, ...available[key] }] : []))
    .filter((stat) => usable(stat.module))
    .slice(0, 2);

  return (
    <Screen>
      <View style={{ borderRadius: theme.radius.xl, overflow: "hidden", padding: 22, gap: 6, marginTop: 4 }}>
        <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0)"]} end={{ x: 0.2, y: 0.8 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text variant="caption" style={{ color: "rgba(255,255,255,0.85)", fontWeight: "700", flex: 1 }}>
            {manifest.data?.tenant.name} · {manifest.data?.role.name}
          </Text>
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={unread ? `${unread} notifiche da leggere` : "Notifiche"}
            onPress={() => router.push("/(app)/notifications")}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={unread ? "notifications" : "notifications-outline"} size={20} color="#fff" />
            {unread ? (
              <View
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 3,
                  backgroundColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#111", fontSize: 10, lineHeight: 12, fontWeight: "800" }}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </Pressy>
        </View>
        <Text variant="display" style={{ color: "#fff" }}>
          {greeting()}, {manifest.data?.user.name.split(" ")[0]}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.85)" }}>{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</Text>
      </View>

      <Text variant="title">Azioni</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {(manifest.data?.modules ?? [])
          .filter((module) => module.key !== "dashboard" && module.status !== "off")
          .map((module) => {
            const title = module.key === "work_orders" ? terms?.workOrders ?? module.label : module.key === "assets" ? terms?.assets ?? module.label : module.label;
            return (
              <Pressy
                key={module.key}
                onPress={() =>
                  module.status === "locked"
                    ? router.push({ pathname: "/(app)/store", params: { module: module.key } })
                    : router.push(`/(app)${module.route}` as never)
                }
                style={{ width: "47%", borderRadius: theme.radius.lg }}
              >
                <Card style={{ gap: 8, minHeight: 92 }}>
                  <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={22} color={theme.colors.accent} />
                  <Text variant="heading">{title}</Text>
                  {module.status === "locked" ? <Badge label="Bloccato" /> : module.status === "trial" ? <Badge tone="accent" label="Prova" /> : null}
                </Card>
              </Pressy>
            );
          })}
      </View>

      <QueryState isLoading={dashboard.isLoading} error={dashboard.error} refetch={() => dashboard.refetch()}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {stats.map((stat) => (
              <Card key={stat.key} style={{ flex: 1, gap: 6 }}>
                <Ionicons name={stat.icon as keyof typeof Ionicons.glyphMap} size={20} color={theme.colors.accent} />
                <Text variant="display">{stat.value}</Text>
                <Text variant="caption" muted>
                  {stat.label}
                </Text>
              </Card>
            ))}
        </View>

        {offer ? (
          <Pressy onPress={() => router.push({ pathname: "/(app)/store", params: { module: offer.key } })} style={{ borderRadius: theme.radius.lg }}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 46, height: 46, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} style={StyleSheet.absoluteFill} />
                <Ionicons name={offer.icon as keyof typeof Ionicons.glyphMap} size={22} color="#fff" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">Prova {offer.label}</Text>
                <Text variant="caption" muted>
                  {offer.pitch}
                </Text>
              </View>
              <Badge tone="accent" label={monthly(offer.priceCents)} />
            </Card>
          </Pressy>
        ) : null}

        <Text variant="title">In scadenza</Text>
        {dashboard.data?.dueSoon.length ? (
          dashboard.data.dueSoon.map((item) => (
            <Card key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 8, alignSelf: "stretch", borderRadius: 4, backgroundColor: theme.colors.accent }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{item.title}</Text>
                <Text variant="caption" muted>
                  {when(item.dueAt)}
                </Text>
              </View>
            </Card>
          ))
        ) : (
          <Text muted>Nessuna scadenza nelle prossime due settimane.</Text>
        )}
      </QueryState>
    </Screen>
  );
}
