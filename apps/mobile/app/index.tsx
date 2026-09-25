import { Redirect } from "expo-router";
import { View } from "react-native";
import { Button, EmptyState, Skeleton } from "@rapportini/ui";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/store";
import { t } from "../src/i18n";
import { useManifest } from "../src/session";

export default function Gate() {
  const token = useAuth((state) => state.accessToken);
  const manifest = useManifest();
  if (!token) return <Redirect href="/(auth)/login" />;
  if (manifest.isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={120} />
      </View>
    );
  }
  if (manifest.error instanceof ApiError && manifest.error.status === 409) return <Redirect href="/(onboarding)" />;
  if (manifest.data) return <Redirect href="/(app)" />;
  return <EmptyState title={t("errorTitle")} message={manifest.error?.message ?? "Sessione non disponibile"} action={<Button label={t("retry")} onPress={() => manifest.refetch()} />} />;
}
