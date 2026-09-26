import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Badge, Card, EmptyState, Fab, ListItem, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL, euro, lineStatusLabel, stationPhrase } from "../../../src/format";
import { can, useCanUse, useManifest, useVocab, vocabLabel } from "../../../src/session";

interface Order {
  id: string;
  status: string;
  table?: { name: string } | null;
  lines: Array<{ id: string; name: string; quantity: number; station: string; status: string }>;
}

interface TableRow {
  id: string;
  name: string;
  seats: number;
  openOrder: { id: string; lines: Array<{ unitPrice: string | number; quantity: number; status: string }> } | null;
}

export default function OrdersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const manifest = useManifest();
  const { stations } = useVocab();
  const hasFloor = useCanUse("floor");
  const writable = can(manifest.data, "orders.write");
  const [choosing, setChoosing] = useState(false);
  const query = useQuery({ queryKey: ["orders"], queryFn: () => http.get<Order[]>("/orders") });
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => http.get<TableRow[]>("/tables"), enabled: choosing && hasFloor });
  const open = useMutation({
    mutationFn: async (table: TableRow | null) => {
      if (table?.openOrder) return table.openOrder.id;
      const order = await http.post<{ id: string }>("/orders", table ? { tableId: table.id, covers: table.seats } : { covers: 1 });
      return order.id;
    },
    onSuccess: async (orderId) => {
      setChoosing(false);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["orders"] }), queryClient.invalidateQueries({ queryKey: ["tables"] })]);
      router.push(`/(app)/orders/${orderId}`);
    },
  });
  const where = stationPhrase(stations.map((station) => station.label), "e");

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">Comande</Text>
      <Text muted>{where ? `Quello che è partito ${where}.` : "Quello che è partito."}</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((order) => (
            <Card key={order.id} style={{ gap: 8 }}>
              <Text variant="heading" onPress={() => router.push(`/(app)/orders/${order.id}`)}>
                {order.table?.name ?? "Banco"}
              </Text>
              {order.lines.length ? (
                order.lines.map((line) => (
                  <Text key={line.id} muted>
                    {[`${line.quantity}× ${line.name}`, lineStatusLabel(line.status, vocabLabel(stations, line.station))].filter(Boolean).join(" · ")}
                  </Text>
                ))
              ) : (
                <Text muted>Ancora niente inviato.</Text>
              )}
              <Badge label={STATUS_LABEL[order.status] ?? order.status} tone="accent" />
            </Card>
          ))
        ) : (
          <EmptyState title="Sala tranquilla" message={writable ? "Tocca + e scegli il tavolo per prendere una comanda." : "Nessuna comanda aperta."} />
        )}
      </QueryState>
      <Sheet visible={choosing} title="Per quale tavolo?" onClose={() => setChoosing(false)}>
        {hasFloor ? (
          <>
            {tables.isLoading ? <Text muted>Carico i tavoli…</Text> : null}
            {tables.error ? <Text style={{ color: theme.colors.danger }}>{tables.error.message}</Text> : null}
            {tables.data?.map((table) => {
              const busy = table.openOrder;
              const total = busy?.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0) ?? 0;
              return (
                <ListItem
                  key={table.id}
                  title={table.name}
                  subtitle={busy ? `Comanda aperta · ${euro(total)} · aggiungi` : `Libero · ${table.seats} posti`}
                  onPress={open.isPending ? undefined : () => open.mutate(table)}
                />
              );
            })}
            {tables.data && tables.data.length === 0 ? <Text muted>Nessun tavolo. Aggiungili dalla Sala.</Text> : null}
          </>
        ) : null}
        <ListItem title="Al banco" subtitle="Senza tavolo" onPress={open.isPending ? undefined : () => open.mutate(null)} />
        {open.error ? <Text style={{ color: theme.colors.danger }}>{open.error.message}</Text> : null}
      </Sheet>
      {writable ? <Fab onPress={() => setChoosing(true)} /> : null}
    </Screen>
  );
}
