import { Tabs } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { TabBar } from "../../src/components/TabBar";
import { t } from "../../src/i18n";
import { useManifest } from "../../src/session";
import NetInfo from "@react-native-community/netinfo";

export default function AppLayout() {
  const manifest = useManifest();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => setOffline(state.isConnected === false));
  }, []);

  useEffect(() => {
    async function register() {
      const settings = await Notifications.getPermissionsAsync();
      const granted = settings.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return;
      const token = await Notifications.getExpoPushTokenAsync().catch(() => null);
      if (!token) return;
      await http.post("/me/push-token", { token: token.data, platform: Platform.OS === "ios" ? "ios" : "android" }).catch(() => undefined);
    }
    if (manifest.data) void register();
  }, [manifest.data]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
      <Tabs
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
          style={{ position: "absolute", top: insets.top + 6, alignSelf: "center", backgroundColor: theme.colors.warning, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 14 }}
        >
          <Text variant="caption" style={{ color: "#fff", fontWeight: "700" }}>
            {t("offline")}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
