import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { useMenu } from "../../../src/session";

interface NavRow { id: string; placement: string; key: string; label: string | null; visible: boolean | null; kind: string }

const PLACEMENT: Record<string, string> = {
  TAB: "Barra in basso",
  MORE: "Altro",
  SETTINGS: "Impostazioni",
  HOME_ACTIONS: "Scorciatoie in home",
};

const placeOf = (placement: string) => PLACEMENT[placement] ?? placement;

export default function ShopMenuScreen() {
  const router = useRouter();
  const menu = useMenu("TAB").concat(useMenu("MORE"), useMenu("SETTINGS"), useMenu("HOME_ACTIONS"));
  const own = useQuery({ queryKey: ["shop-config"], queryFn: () => http.get<{ nav: NavRow[] }>("/settings/config") });
  const hide = useMutation({
    mutationFn: (item: { placement: string; key: string; kind: string; label: string }) =>
      http.put("/settings/menu", { placement: item.placement, key: item.key, kind: item.kind, label: item.label, visible: false }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-config"] });
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => http.del(`/settings/menu/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-config"] });
    },
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni" onRefresh={() => own.refetch()}>
      <Text variant="display">Voci dell'app</Text>
      <Text muted>Nascondi una voce solo in questo negozio. La barra in basso ne mostra al massimo cinque.</Text>
      {menu.map((item) => (
        <Card key={`${item.placement}:${item.key}`} style={{ gap: 4 }}>
          <Text>{`${placeOf(item.placement)} · ${item.label}`}</Text>
          <Button label="Nascondi qui" tone="ghost" onPress={() => hide.mutate({ placement: item.placement, key: item.key, kind: item.kind, label: item.label })} />
        </Card>
      ))}
      {(own.data?.nav ?? []).map((item) => (
        <Card key={item.id} style={{ gap: 4 }}>
          <Text variant="caption">{`Cambiata da te · ${placeOf(item.placement)} · ${item.label ?? item.key}`}</Text>
          <Button label="Torna a ereditare" tone="secondary" onPress={() => restore.mutate(item.id)} />
        </Card>
      ))}
    </Screen>
  );
}
