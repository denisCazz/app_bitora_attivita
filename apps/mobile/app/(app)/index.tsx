import { isUsable, type ManifestModule } from "@rapportini/shared";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Badge, Button, Card, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { monthly, useLockedModules } from "../../src/billing";
import { QueryState } from "../../src/components/States";
import { when } from "../../src/format";
import { pickHomeActions, useHomeActions } from "../../src/home-actions";
import { useNotices } from "../../src/notices";
import { modulePermitted, useManifest, useVocab } from "../../src/session";

interface Dashboard {
  openWorkOrders: number;
  openOrders: number;
  lowStock: number;
  lowInventory?: number;
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
  const offer = useLockedModules().find((module) => module.status === "locked" && module.recommended && modulePermitted(manifest.data, module.key));
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => http.get<Dashboard>("/dashboard"), enabled: Boolean(manifest.data) });
  const notices = useNotices(Boolean(manifest.data));
  const unread = (notices.data ?? []).filter((notice) => !notice.readAt).length;
  const [managing, setManaging] = useState(false);
  const homeActions = useHomeActions(manifest.data?.user.id, manifest.data?.tenant.id);
  const candidates = (manifest.data?.modules ?? []).filter(
    (module) => module.key !== "dashboard" && module.status !== "off" && modulePermitted(manifest.data, module.key),
  );
  const shown = homeActions.ready ? pickHomeActions(candidates, homeActions.selected) : candidates;

  function moduleTitle(module: ManifestModule) {
    if (module.key === "work_orders") return terms?.workOrders ?? module.label;
    if (module.key === "assets") return terms?.assets ?? module.label;
    return module.label;
  }

  const available: Record<string, { module: string; label: string; value: number; icon: string }> = {
    openWorkOrders: { module: "work_orders", label: `${terms?.workOrders ?? moduleOf("work_orders")?.label ?? ""} in corso`, value: dashboard.data?.openWorkOrders ?? 0, icon: "construct-outline" },
    openOrders: { module: "orders", label: `${moduleOf("orders")?.label ?? ""} in corso`, value: dashboard.data?.openOrders ?? 0, icon: "receipt-outline" },
    lowStock: { module: "spare_parts", label: `${terms?.spareParts ?? moduleOf("spare_parts")?.label ?? ""} sotto scorta`, value: dashboard.data?.lowStock ?? 0, icon: "cube-outline" },
    lowInventory: { module: "inventory", label: "Da riordinare", value: dashboard.data?.lowInventory ?? 0, icon: "layers-outline" },
  };
  const configured = useVocab().dashboard ?? [];
  const order = [...configured, ...Object.keys(available).filter((key) => !configured.includes(key))];
  const stats = order
    .flatMap((key) => (available[key] ? [{ key, ...available[key] }] : []))
    .filter((stat) => usable(stat.module))
    .slice(0, 2);

  const iconTile = (size: number) => ({
    width: size,
    height: size,
    borderRadius: size * 0.32,
    borderCurve: "continuous" as const,
    backgroundColor: theme.colors.accentSoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  });

  return (
    <Screen onRefresh={() => Promise.all([dashboard.refetch(), notices.refetch(), manifest.refetch()])}>
      <View style={{ borderRadius: theme.radius.xl, borderCurve: "continuous", overflow: "hidden", padding: 22, gap: 4, marginTop: 4 }}>
        <LinearGradient colors={[theme.colors.accent, theme.colors.accentAlt]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0)"]} end={{ x: 0.2, y: 0.8 }} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <View style={{ flexShrink: 1, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text variant="caption" numberOfLines={1} style={{ color: "#fff", fontWeight: "700" }}>
              {manifest.data?.tenant.name} · {manifest.data?.role.name}
            </Text>
          </View>
          <Pressy
            accessibilityRole="button"
            accessibilityLabel={unread ? `${unread} notifiche da leggere` : "Notifiche"}
            onPress={() => router.push("/(app)/notifications")}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" }}
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
        <Text variant="label" style={{ color: "rgba(255,255,255,0.8)", textTransform: "capitalize" }}>
          {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <Text variant="display" style={{ color: "#fff" }}>
          {greeting()}, {manifest.data?.user.name.split(" ")[0]}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text variant="title">Azioni</Text>
        {candidates.length ? (
          <Pressy accessibilityRole="button" accessibilityLabel="Gestisci azioni in home" hitSlop={8} onPress={() => setManaging(true)}>
            <Text variant="label" style={{ color: theme.colors.accent }}>
              Gestisci
            </Text>
          </Pressy>
        ) : null}
      </View>
      {shown.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {shown.map((module) => {
            const title = moduleTitle(module);
            const locked = module.status === "locked";
            return (
              <Pressy
                key={module.key}
                accessibilityRole="button"
                accessibilityLabel={locked ? `${title}, bloccato` : title}
                onPress={() =>
                  locked
                    ? router.push({ pathname: "/(app)/store/[key]", params: { key: module.key } })
                    : router.push(`/(app)${module.route}` as never)
                }
                style={{ flexBasis: "45%", flexGrow: 1, borderRadius: theme.radius.lg }}
              >
                <Card style={{ gap: 12, minHeight: 104, justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={[iconTile(38), locked ? { backgroundColor: theme.colors.field } : null]}>
                      <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={20} color={locked ? theme.colors.inkSoft : theme.colors.accent} />
                    </View>
                    {locked ? <Ionicons name="lock-closed" size={14} color={theme.colors.inkSoft} /> : module.status === "trial" ? <Badge tone="accent" label="Prova" /> : null}
                  </View>
                  <Text variant="heading" numberOfLines={2} style={locked ? { color: theme.colors.inkSoft } : null}>
                    {title}
                  </Text>
                </Card>
              </Pressy>
            );
          })}
        </View>
      ) : candidates.length ? (
        <Card>
          <Text muted>Nessuna azione in home. Tocca Gestisci per sceglierne una.</Text>
        </Card>
      ) : null}
      <Sheet visible={managing} title="Azioni in home" onClose={() => setManaging(false)}>
        <Text muted>Scegli quali vedere in home. Il menu dell'app non cambia.</Text>
        <Card style={{ paddingVertical: 4 }}>
          {candidates.map((module, index) => {
            const on = homeActions.selected ? homeActions.selected.includes(module.key) : true;
            return (
              <View
                key={module.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 10,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: theme.colors.line,
                }}
              >
                <View style={[iconTile(36), module.status === "locked" ? { backgroundColor: theme.colors.field } : null]}>
                  <Ionicons
                    name={module.icon as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={module.status === "locked" ? theme.colors.inkSoft : theme.colors.accent}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading">{moduleTitle(module)}</Text>
                  {module.status === "locked" ? (
                    <Text variant="caption" muted>
                      Bloccato
                    </Text>
                  ) : null}
                </View>
                <Switch
                  accessibilityLabel={moduleTitle(module)}
                  value={on}
                  disabled={!homeActions.ready}
                  onValueChange={(value) => homeActions.toggle(candidates.map((item) => item.key), module.key, value)}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
                  thumbColor="#fff"
                />
              </View>
            );
          })}
        </Card>
        {homeActions.selected ? <Button tone="ghost" label="Mostra tutte" onPress={() => void homeActions.save(null)} /> : null}
      </Sheet>

      <QueryState isLoading={dashboard.isLoading} error={dashboard.error} refetch={() => dashboard.refetch()}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {stats.map((stat) => (
              <Card key={stat.key} style={{ flex: 1, gap: 4 }}>
                <View style={[iconTile(32), { marginBottom: 6 }]}>
                  <Ionicons name={stat.icon as keyof typeof Ionicons.glyphMap} size={17} color={theme.colors.accent} />
                </View>
                <Text variant="display" style={{ fontVariant: ["tabular-nums"] }}>
                  {stat.value}
                </Text>
                <Text variant="caption" muted>
                  {stat.label}
                </Text>
              </Card>
            ))}
        </View>

        {offer ? (
          <Pressy onPress={() => router.push({ pathname: "/(app)/store/[key]", params: { key: offer.key } })} style={{ borderRadius: theme.radius.lg }}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, borderCurve: "continuous", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
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
          <Card style={{ paddingVertical: 4 }}>
            {dashboard.data.dueSoon.map((item, index) => {
              const due = new Date(item.dueAt);
              return (
                <View
                  key={item.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingVertical: 12,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: theme.colors.line,
                  }}
                >
                  <View style={[iconTile(44), { gap: 0 }]}>
                    <Text style={{ color: theme.colors.accent, fontSize: 17, lineHeight: 19, fontWeight: "800" }}>{due.getDate()}</Text>
                    <Text style={{ color: theme.colors.accent, fontSize: 10, lineHeight: 12, fontWeight: "700", textTransform: "uppercase" }}>
                      {due.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text variant="caption" muted>
                      {when(item.dueAt)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        ) : (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
            <Text muted style={{ flex: 1 }}>
              Nessuna scadenza nelle prossime due settimane.
            </Text>
          </Card>
        )}
      </QueryState>
    </Screen>
  );
}
