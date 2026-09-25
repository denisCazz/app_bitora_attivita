import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Badge, Card, EmptyState, Fab, ListItem, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL, when } from "../../../src/format";
import { t } from "../../../src/i18n";
import { useManifest } from "../../../src/session";

interface WorkOrder {
  id: string;
  title: string;
  status: string;
  scheduledAt?: string | null;
  customer?: { name: string } | null;
  asset?: { name: string } | null;
}

export default function WorkOrdersScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const title = manifest.data?.tenant.terminology.workOrders ?? "Interventi";
  const query = useQuery({ queryKey: ["work-orders"], queryFn: () => http.get<WorkOrder[]>("/work-orders") });

  return (
    <Screen>
      <Text variant="display">{title}</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((order) => (
            <Card key={order.id}>
              <ListItem
                title={order.title}
                subtitle={[order.customer?.name, order.asset?.name, when(order.scheduledAt)].filter(Boolean).join(" · ")}
                trailing={<Badge label={STATUS_LABEL[order.status] ?? order.status} tone={order.status === "DONE" ? "success" : "accent"} />}
                onPress={() => router.push(`/(app)/work-orders/${order.id}`)}
              />
            </Card>
          ))
        ) : (
          <EmptyState title={t("emptyTitle")} message="Crea il primo intervento dal pulsante in basso." />
        )}
      </QueryState>
      <Fab onPress={() => router.push("/(app)/work-orders/new")} />
    </Screen>
  );
}
