import type { ReactNode } from "react";
import { View } from "react-native";
import { Button, EmptyState, Skeleton } from "@rapportini/ui";
import { t } from "../i18n";

export function QueryState({
  isLoading,
  error,
  refetch,
  placeholder,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  refetch?: () => void;
  placeholder?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      placeholder ?? (
        <View style={{ gap: 12 }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      )
    );
  }
  if (error) {
    return <EmptyState title={t("errorTitle")} message={error.message} action={refetch ? <Button label={t("retry")} onPress={refetch} /> : undefined} />;
  }
  return <View style={{ gap: 16, flexGrow: 1 }}>{children}</View>;
}
