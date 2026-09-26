import { Tabs, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Glass, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { TabBar } from "../../src/components/TabBar";
import { TermsGate } from "../../src/components/TermsGate";
import { t } from "../../src/i18n";
import { can, useManifest } from "../../src/session";
import { useStoreSync } from "../../src/billing";
import NetInfo from "@react-native-community/netinfo";

export default function AppLayout() {
  const manifest = useManifest();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  useStoreSync(can(manifest.data, "settings.manage"));

  useEffect(() => {
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
        screenOptions={{ headerShown: false, animation: "fade", lazy: true, sceneStyle: { backgroundColor: "transparent" } }}
        tabBar={() => <TabBar items={manifest.data?.navigation ?? []} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="more" />
      </Tabs>
      {offline ? (
        <Animated.View
          entering={FadeInUp}
          exiting={FadeOutUp}
          style={{ position: "absolute", top: insets.top + 6, alignSelf: "center" }}
        >
          <Glass liquid glassTint={theme.colors.warning} rounded={99} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 14 }}>
            <Ionicons name="cloud-offline" size={14} color="#fff" />
            <Text variant="caption" style={{ color: "#fff", fontWeight: "700" }}>
              {t("offline")}
            </Text>
          </Glass>
        </Animated.View>
      ) : null}
      <TermsGate />
    </View>
  );
}
