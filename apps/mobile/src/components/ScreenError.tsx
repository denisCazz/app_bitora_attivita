import { Ionicons } from "@expo/vector-icons";
import { router, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop, Button, Text, ThemeProvider, useTheme } from "@rapportini/ui";
import { t } from "../i18n";

function Fallback({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    console.error("[schermata] errore", error);
  }, [error]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper, justifyContent: "center", paddingHorizontal: theme.space.xl, paddingTop: insets.top, paddingBottom: insets.bottom, gap: theme.space.md }}>
      <Backdrop />
      <View style={{ alignItems: "center", gap: theme.space.sm }}>
        <Ionicons name="bandage-outline" size={44} color={theme.colors.accent} />
        <Text variant="title" style={{ textAlign: "center" }}>
          {t("errorTitle")}
        </Text>
        <Text muted style={{ textAlign: "center" }}>
          Questa schermata si è inceppata. Riprova: i tuoi dati sono al sicuro.
        </Text>
        <Text variant="caption" muted style={{ textAlign: "center" }} numberOfLines={3}>
          {error.message}
        </Text>
      </View>
      <Button label={t("retry")} onPress={() => void retry()} />
      <Button
        tone="ghost"
        label="Torna alla home"
        onPress={() => {
          router.replace("/");
          void retry();
        }}
      />
    </View>
  );
}

/** Shown in place of a single screen that throws while rendering, so the rest of the app keeps working. */
export function ScreenError(props: ErrorBoundaryProps) {
  return <Fallback {...props} />;
}

/** Last resort for errors above the theme and safe-area providers. */
export function RootError(props: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Fallback {...props} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
