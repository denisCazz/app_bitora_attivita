import { Tabs, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Glass, Pressy, Text, useTheme } from "@rapportini/ui";
import { flushQueue, http, refreshOutbox, useOutbox } from "../../src/api/client";
import { TabBar } from "../../src/components/TabBar";
import { TermsGate } from "../../src/components/TermsGate";
import { t } from "../../src/i18n";
import { can, useManifest } from "../../src/session";
import { useCheckoutWatcher, useStoreSync } from "../../src/billing";
import NetInfo from "@react-native-community/netinfo";

export default function AppLayout() {
  const manifest = useManifest();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const pending = useOutbox((state) => state.pending);
  const sending = useOutbox((state) => state.sending);
  const refused = useOutbox((state) => state.failed[0]);
  const dismiss = useOutbox((state) => state.dismiss);
  useStoreSync(can(manifest.data, "settings.manage"));
  useCheckoutWatcher();

  useEffect(() => {
    void refreshOutbox().then(() => flushQueue());
    return NetInfo.addEventListener((state) => setOffline(state.isConnected === false));
  }, []);

  useEffect(() => {
    async function register() {
      if (Platform.OS === "ios") {
        await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        }).catch(() => undefined);
      }
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("alerts", {
          name: "Avvisi",
          importance: Notifications.AndroidImportance.HIGH,
        }).catch(() => undefined);
      }
      const settings = await Notifications.getPermissionsAsync();
      const granted = settings.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return;
      const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
      if (!token) return;
      await http.post("/me/push-token", { token: token.data, platform: Platform.OS === "ios" ? "ios" : "android" }).catch(() => undefined);
    }
    if (manifest.data) void register();
  }, [manifest.data]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) {
        router.push(`/(app)${href}` as never);
      }
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
      <Tabs
        backBehavior="history"
        screenOptions={{ headerShown: false, animation: "none", lazy: true, sceneStyle: { backgroundColor: "transparent" } }}
        tabBar={() => <TabBar items={manifest.data?.navigation ?? []} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="more" />
      </Tabs>
      {refused ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, alignItems: "center" }}>
          <Pressy accessibilityRole="button" accessibilityHint="Tocca per chiudere" onPress={() => dismiss(refused.id)}>
            <Glass liquid glassTint={theme.colors.danger} rounded={18} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 14 }}>
              <Ionicons name="alert-circle" size={16} color="#fff" />
              <Text variant="caption" style={{ color: "#fff", fontWeight: "700", flexShrink: 1 }}>
                {`${refused.label} ${t("outboxRefused")}: ${refused.error}`}
              </Text>
              <Ionicons name="close" size={14} color="#fff" />
            </Glass>
          </Pressy>
        </Animated.View>
      ) : offline || (sending && pending > 0) ? (
        <Animated.View
          entering={FadeInUp}
          exiting={FadeOutUp}
          style={{ position: "absolute", top: insets.top + 6, left: 16, right: 16, alignItems: "center" }}
        >
          <Glass
            liquid
            glassTint={offline ? theme.colors.warning : theme.colors.accent}
            rounded={99}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 14 }}
          >
            <Ionicons name={offline ? "cloud-offline" : "cloud-upload"} size={14} color="#fff" />
            <Text variant="caption" style={{ color: "#fff", fontWeight: "700", flexShrink: 1 }}>
              {offline ? t("offline") : t("outboxSending")}
              {pending > 0 ? ` · ${pending} ${t("outboxWaiting")}` : ""}
            </Text>
          </Glass>
        </Animated.View>
      ) : null}
      <TermsGate />
    </View>
  );
}
