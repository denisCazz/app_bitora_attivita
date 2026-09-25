import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, Card, Input, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL, euro } from "../../../src/format";
import { can, useManifest } from "../../../src/session";

interface Line { id: string; name: string; quantity: number; unitPrice: string | number; station: string; status: string; note?: string | null }
interface Order { id: string; status: string; covers: number; table?: { name: string } | null; lines: Line[] }
interface MenuItem { id: string; name: string; category: string; price: string | number; station: string; modifiers: Array<{ modifier: { id: string; name: string; priceDelta: string | number } }> }

export default function OrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const manifest = useManifest();
  const [menuOpen, setMenuOpen] = useState(false);
  const [written, setWritten] = useState("");
  const [price, setPrice] = useState("");
  const [reparto, setReparto] = useState("");
  const [quantity, setQuantity] = useState("");
  const [split, setSplit] = useState(1);
  const order = useQuery({ queryKey: ["order", id], queryFn: () => http.get<Order>(`/orders/${id}`) });
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => http.get<MenuItem[]>("/menu-items"), enabled: menuOpen });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["order", id] });
  const add = useMutation({
    mutationFn: (body: { menuItemId?: string; name?: string; unitPrice?: number; station?: "BAR" | "KITCHEN" | "OTHER"; note?: string }) => {
      const amount = Number(quantity.replace(",", "."));
      if (!Number.isInteger(amount) || amount < 1) throw new Error("Scrivi la quantità");
      return http.post(`/orders/${id}/lines`, { ...body, quantity: amount, modifierIds: [] });
    },
    onSuccess: async () => {
      setWritten("");
      setPrice("");
      setReparto("");
      setQuantity("");
      await refresh();
    },
  });
  const send = useMutation({ mutationFn: () => http.post(`/orders/${id}/send`), onSuccess: refresh });
  const close = useMutation({
    mutationFn: () => {
      const total = totalOf(order.data);
      const share = Math.round((total / split) * 100) / 100;
      const payments = Array.from({ length: split }, (_, index) => ({
        label: split === 1 ? "Conto unico" : `Quota ${index + 1}`,
        amount: index === split - 1 ? Math.round((total - share * (split - 1)) * 100) / 100 : share,
      }));
      return http.post(`/orders/${id}/close`, { payments });
    },
    onSuccess: refresh,
  });
  const voidOrder = useMutation({ mutationFn: () => http.post(`/orders/${id}/void`), onSuccess: refresh });
  const lineStatus = useMutation({
    mutationFn: (input: { lineId: string; status: string }) => http.patch(`/orders/${id}/lines/${input.lineId}`, { status: input.status }),
    onSuccess: refresh,
  });

  const total = totalOf(order.data);
  return (
    <Screen onBack={() => router.back()}>
      <QueryState isLoading={order.isLoading} error={order.error} refetch={() => order.refetch()}>
        {order.data ? (
          <>
            <Text variant="display">{order.data.table?.name ?? "Banco"}</Text>
            <Text muted>
              {order.data.covers} coperti · {STATUS_LABEL[order.data.status]}
            </Text>
            {order.data.lines.map((line) => (
              <Card key={line.id} style={{ gap: 6 }}>
                <Text variant="heading">
                  {line.quantity}× {line.name}
                </Text>
                <Text muted>
                  {[line.note, line.station === "BAR" ? "Bar" : line.station === "KITCHEN" ? "Cucina" : "", STATUS_LABEL[line.status], euro(Number(line.unitPrice) * line.quantity)].filter(Boolean).join(" · ")}
                </Text>
                {line.status === "SENT" ? <Button label="Pronto" tone="secondary" onPress={() => lineStatus.mutate({ lineId: line.id, status: "READY" })} /> : null}
              </Card>
            ))}
            <Text variant="title">{euro(total)}</Text>
            {order.data.status !== "CLOSED" && order.data.status !== "VOID" ? (
              <>
                <Button label="Aggiungi dal menu" onPress={() => setMenuOpen(true)} />
                <Button label="Invia a bar e cucina" tone="secondary" onPress={() => send.mutate()} />
                <Text variant="label">Dividi il conto</Text>
                <Text muted>{split === 1 ? "Conto unico" : `${split} quote da ${euro(total / split)}`}</Text>
                <Button label={split < 6 ? "Aggiungi una quota" : "Massimo 6 quote"} tone="ghost" onPress={() => setSplit((value) => Math.min(6, value + 1))} />
                <Button label="Chiudi conto" onPress={() => close.mutate()} />
                {can(manifest.data, "orders.void") ? <Button label="Annulla comanda" tone="danger" onPress={() => voidOrder.mutate()} /> : null}
              </>
            ) : (
              <Text muted>Comanda chiusa. Lo scarico magazzino è già stato fatto dalle ricette.</Text>
            )}
            {close.error ? <Text style={{ color: theme.colors.danger }}>{close.error.message}</Text> : null}
            <Sheet visible={menuOpen} title="Aggiungi" onClose={() => setMenuOpen(false)}>
              <Text variant="heading">Scrivi una voce</Text>
              <Input label="Nome" value={written} onChangeText={setWritten} />
              <Input label="Prezzo" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
              <Input label="Reparto" value={reparto} onChangeText={setReparto} />
              <Input label="Quantità" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} />
              {add.error ? <Text>{add.error.message}</Text> : null}
              <Button
                label="Aggiungi scritto"
                disabled={written.trim().length < 1 || !quantity.trim()}
                loading={add.isPending}
                onPress={() => {
                  const word = reparto.trim().toLowerCase();
                  const station = word === "bar" ? "BAR" : word === "cucina" ? "KITCHEN" : "OTHER";
                  add.mutate({ name: written.trim(), unitPrice: Number(price.replace(",", ".")) || 0, station, note: reparto.trim() || undefined });
                }}
              />
              <Text variant="heading">Dal menu</Text>
              {menu.data?.map((item) => (
                <Button key={item.id} label={`${item.name} · ${euro(item.price)}`} tone="secondary" disabled={!quantity.trim()} onPress={() => add.mutate({ menuItemId: item.id })} />
              ))}
            </Sheet>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

function totalOf(order?: Order) {
  return order?.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0) ?? 0;
}
