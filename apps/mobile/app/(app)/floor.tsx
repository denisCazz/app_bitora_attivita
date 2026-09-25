import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["tables"] });
      const previous = queryClient.getQueryData<TableCard[]>(["tables"]);
      queryClient.setQueryData<TableCard[]>(["tables"], (tables) => tables?.map((item) => (item.id === input.id ? { ...item, posX: input.posX, posY: input.posY } : item)));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["tables"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tables"] }),
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
      <Text muted>Trascina i tavoli per sistemare la piantina.</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        <Glass
          rounded={28}
          style={{ flex: 1 }}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setSize((current) => (Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height }));
          }}
        >
          {size.width > 1 && size.height > 1
            ? query.data?.map((table) => (
                <DraggableTable key={table.id} table={table} width={size.width} height={size.height} onOpen={() => create.mutate(table)} onMove={(posX, posY) => move.mutate({ id: table.id, posX, posY })} />
              ))
            : null}
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

function clampToFloor(value: number, span: number) {
  "worklet";
  const size = Math.max(span, 1);
  return Math.min(size * 0.78, Math.max(size * 0.02, value));
}

function DraggableTable({ table, width, height, onOpen, onMove }: { table: TableCard; width: number; height: number; onOpen: () => void; onMove: (x: number, y: number) => void }) {
  const theme = useTheme();
  const x = useSharedValue(table.posX * width);
  const y = useSharedValue(table.posY * height);
  const startX = useSharedValue(x.value);
  const startY = useSharedValue(y.value);
  const dragging = useSharedValue(false);
  const lifted = useSharedValue(0);
  const widthSv = useSharedValue(width);
  const heightSv = useSharedValue(height);
  const onMoveRef = useRef(onMove);
  const onOpenRef = useRef(onOpen);
  const dragLock = useRef(false);
  const placed = useRef({ x: table.posX, y: table.posY });
  onMoveRef.current = onMove;
  onOpenRef.current = onOpen;
  widthSv.value = width;
  heightSv.value = height;

  useLayoutEffect(() => {
    if (dragLock.current) return;
    const samePlace = Math.abs(table.posX - placed.current.x) < 0.0001 && Math.abs(table.posY - placed.current.y) < 0.0001;
    const nextX = table.posX * width;
    const nextY = table.posY * height;
    if (samePlace && Math.abs(x.value - nextX) < 1 && Math.abs(y.value - nextY) < 1) return;
    placed.current = { x: table.posX, y: table.posY };
    x.value = nextX;
    y.value = nextY;
  }, [height, table.posX, table.posY, width, x, y]);

  const lock = useCallback(() => {
    dragLock.current = true;
  }, []);
  const commit = useCallback((posX: number, posY: number) => {
    dragLock.current = false;
    placed.current = { x: posX, y: posY };
    onMoveRef.current(posX, posY);
  }, []);
  const open = useCallback(() => {
    onOpenRef.current();
  }, []);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .maxPointers(1)
      .minDistance(4)
      .onBegin(() => {
        startX.value = x.value;
        startY.value = y.value;
      })
      .onStart(() => {
        dragging.value = true;
        lifted.value = 1;
        runOnJS(lock)();
      })
      .onUpdate((event) => {
        x.value = clampToFloor(startX.value + event.translationX, widthSv.value);
        y.value = clampToFloor(startY.value + event.translationY, heightSv.value);
      })
      .onFinalize(() => {
        const active = dragging.value === true;
        dragging.value = false;
        lifted.value = 0;
        if (!active) return;
        const spanW = Math.max(widthSv.value, 1);
        const spanH = Math.max(heightSv.value, 1);
        runOnJS(commit)(x.value / spanW, y.value / spanH);
      });
    const tap = Gesture.Tap()
      .maxDistance(12)
      .onEnd((_event, success) => {
        if (success) runOnJS(open)();
      });
    return Gesture.Race(pan, tap);
  }, [commit, dragging, heightSv, lifted, lock, open, startX, startY, widthSv, x, y]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    zIndex: lifted.value,
  }));
  const total = table.openOrder?.lines.filter((line) => line.status !== "VOID").reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0) ?? 0;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={table.name}
        style={[{ position: "absolute", left: 0, top: 0 }, animatedStyle]}
      >
        <View
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
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
