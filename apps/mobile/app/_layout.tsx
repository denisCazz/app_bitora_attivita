import "react-native-gesture-handler";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "@rapportini/ui";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { ApiError, setOnline } from "../src/api/client";
import { persister, queryClient } from "../src/api/query";
import { useAuth } from "../src/auth/store";
import { LaunchSplash } from "../src/components/LaunchSplash";
import { stackOptions } from "../src/navigation";
import { useManifest, useTenantRepair } from "../src/session";

SplashScreen.setOptions({ duration: 400, fade: true });
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
  useTenantRepair(manifest.error instanceof ApiError && manifest.error.status === 409);
  return (
    <ThemeProvider accent={manifest.data?.tenant.branding.accent}>
      <Stack screenOptions={{ ...stackOptions, animation: "fade", fullScreenGestureEnabled: false }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const hydrate = useAuth((state) => state.hydrate);
  const hydrated = useAuth((state) => state.hydrated);
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    void hydrate();
    return NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected)));
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#07080B" }}>
      <SafeAreaProvider>
        {hydrated ? (
          <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}>
            <Shell />
          </PersistQueryClientProvider>
        ) : null}
        {splashDone ? null : <LaunchSplash ready={hydrated} onFinish={finishSplash} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
