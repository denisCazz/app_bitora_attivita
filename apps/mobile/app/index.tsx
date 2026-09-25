import { Redirect } from "expo-router";
import { View } from "react-native";
import { Button, EmptyState, Skeleton } from "@rapportini/ui";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/store";
import { t } from "../src/i18n";
import { useManifest, useTenantRepairState } from "../src/session";

function Waiting() {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Skeleton height={28} width="60%" />
      <Skeleton height={120} />
    </View>
  );
}

export default function Gate() {
  const token = useAuth((state) => state.accessToken);
  const manifest = useManifest();
  const repair = useTenantRepairState();
  const needsShop = manifest.error instanceof ApiError && manifest.error.status === 409;
  const waiting =
    manifest.isLoading ||
    repair.status === "pending" ||
    (needsShop && repair.status === "idle") ||
    (needsShop && repair.status !== "failed" && manifest.isFetching);
  if (!token) return <Redirect href="/(auth)/login" />;
  if (waiting) return <Waiting />;
  if (manifest.data) return <Redirect href="/(app)" />;
  if (needsShop) return <Redirect href={repair.platformAdmin ? "/(app)/admin" : "/(onboarding)"} />;
  return <EmptyState title={t("errorTitle")} message={manifest.error?.message ?? "Sessione non disponibile"} action={<Button label={t("retry")} onPress={() => manifest.refetch()} />} />;
}
