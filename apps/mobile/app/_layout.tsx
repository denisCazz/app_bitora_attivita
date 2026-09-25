import "react-native-gesture-handler";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "@rapportini/ui";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { setOnline } from "../src/api/client";
import { persister, queryClient } from "../src/api/query";
import { useAuth } from "../src/auth/store";
import { stackOptions } from "../src/navigation";
import { useManifest } from "../src/session";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function Shell() {
  const manifest = useManifest();
  return (
    <ThemeProvider accent={manifest.data?.tenant.branding.accent}>
      <Stack screenOptions={{ ...stackOptions, animation: "fade", fullScreenGestureEnabled: false }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const hydrate = useAuth((state) => state.hydrate);
  const hydrated = useAuth((state) => state.hydrated);

  useEffect(() => {
    void hydrate().finally(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    });
    return NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected)));
  }, [hydrate]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}>
          <Shell />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
