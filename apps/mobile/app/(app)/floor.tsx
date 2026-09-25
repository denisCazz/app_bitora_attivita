import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import { Button, Glass, Input, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";
import { euro } from "../../src/format";

interface TableCard {
  id: string;
  name: string;
  seats: number;
  posX: number;
  posY: number;
  openOrder: { id: string; lines: Array<{ unitPrice: string | number; quantity: number; status: string }> } | null;
}

export default function FloorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("");
  const query = useQuery({ queryKey: ["tables"], queryFn: () => http.get<TableCard[]>("/tables") });
  const create = useMutation({
    mutationFn: async (table: TableCard) => {
      if (table.openOrder) return table.openOrder.id;
      const order = await http.post<{ id: string }>("/orders", { tableId: table.id, covers: table.seats });
      return order.id;
    },
    onSuccess: async (orderId) => {
      await queryClient.invalidateQueries({ queryKey: ["tables"] });
      router.push(`/(app)/orders/${orderId}`);
    },
  });
  const move = useMutation({
    mutationFn: (input: { id: string; posX: number; posY: number }) => http.patch(`/tables/${input.id}`, { posX: input.posX, posY: input.posY }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tables"] }),
  });
  const add = useMutation({
    mutationFn: () => http.post("/tables", { name: name.trim(), seats: Number(seats) || undefined, posX: 0.4, posY: 0.4 }),
    onSuccess: () => {
      setAdding(false);
      setName("");
      setSeats("");
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    },
  });

  return (
    <Screen scroll={false}>
      <Text variant="display">Sala</Text>
      <Text muted>Tieni premuto e trascina per sistemare la piantina.</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        <Glass rounded={28} style={{ flex: 1 }} onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          {query.data?.map((table) => (
            <DraggableTable key={table.id} table={table} width={size.width} height={size.height} onOpen={() => create.mutate(table)} onMove={(posX, posY) => move.mutate({ id: table.id, posX, posY })} />
          ))}
        </Glass>
      </QueryState>
      <Button label="Aggiungi tavolo" tone="secondary" onPress={() => setAdding(true)} />
      <Sheet visible={adding} title="Nuovo tavolo" onClose={() => setAdding(false)}>
        <Input label="Nome" value={name} onChangeText={setName} />
        <Input label="Posti" keyboardType="number-pad" value={seats} onChangeText={setSeats} />
        {add.error ? <Text>{add.error.message}</Text> : null}
        <Button label="Salva" loading={add.isPending} disabled={name.trim().length < 1} onPress={() => add.mutate()} />
      </Sheet>
    </Screen>
  );
}

function DraggableTable({ table, width, height, onOpen, onMove }: { table: TableCard; width: number; height: number; onOpen: () => void; onMove: (x: number, y: number) => void }) {
  const theme = useTheme();
  const metrics = useRef({ width, height, x: table.posX, y: table.posY, onMove });
  metrics.current = { width, height, x: table.posX, y: table.posY, onMove };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) return;
        const current = metrics.current;
        const posX = Math.min(0.78, Math.max(0.02, current.x + gesture.dx / current.width));
        const posY = Math.min(0.78, Math.max(0.02, current.y + gesture.dy / current.height));
        current.onMove(posX, posY);
      },
    }),
  ).current;
  const total = table.openOrder?.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0) ?? 0;
  return (
    <View {...pan.panHandlers} style={{ position: "absolute", left: `${table.posX * 100}%`, top: `${table.posY * 100}%` }}>
      <Pressable
        onPress={onOpen}
        style={{
          minWidth: 84,
          padding: 12,
          borderRadius: 18,
          backgroundColor: table.openOrder ? theme.colors.accent : theme.colors.field,
          borderWidth: 1,
          borderColor: table.openOrder ? theme.colors.accent : theme.colors.glassBorder,
          shadowColor: table.openOrder ? theme.colors.accent : "#000",
          shadowOpacity: table.openOrder ? 0.4 : 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Text style={{ color: table.openOrder ? "#fff" : theme.colors.ink, fontWeight: "700" }}>{table.name}</Text>
        <Text variant="caption" style={{ color: table.openOrder ? "#fff" : theme.colors.inkSoft }}>
          {table.openOrder ? euro(total) : `${table.seats} posti`}
        </Text>
      </Pressable>
    </View>
  );
}
