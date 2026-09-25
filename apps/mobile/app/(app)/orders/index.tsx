import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Badge, Card, EmptyState, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL } from "../../../src/format";
import { useVocab, vocabLabel } from "../../../src/session";

interface Order {
  id: string;
  status: string;
  table?: { name: string } | null;
  lines: Array<{ id: string; name: string; quantity: number; station: string; status: string }>;
}

export default function OrdersScreen() {
  const router = useRouter();
  const { stations } = useVocab();
  const query = useQuery({ queryKey: ["orders"], queryFn: () => http.get<Order[]>("/orders") });
  return (
    <Screen>
      <Text variant="display">Comande</Text>
      <Text muted>Quello che è partito verso {stations.map((station) => station.label.toLowerCase()).join(", ")}.</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((order) => (
            <Card key={order.id} style={{ gap: 8 }}>
              <Text variant="heading" onPress={() => router.push(`/(app)/orders/${order.id}`)}>
                {order.table?.name ?? "Banco"}
              </Text>
              {order.lines.map((line) => (
                <Text key={line.id} muted>
                  {[`${line.quantity}× ${line.name}`, stations.length > 1 ? vocabLabel(stations, line.station) : "", STATUS_LABEL[line.status]].filter(Boolean).join(" · ")}
                </Text>
              ))}
              <Badge label={STATUS_LABEL[order.status] ?? order.status} tone="accent" />
            </Card>
          ))
        ) : (
          <EmptyState title="Sala tranquilla" message="Apri un tavolo dalla piantina per prendere una comanda." />
        )}
      </QueryState>
    </Screen>
  );
}
