import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { useMenu } from "../../../src/session";

interface NavRow { id: string; placement: string; key: string; label: string | null; visible: boolean | null; kind: string }

export default function ShopMenuScreen() {
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
    <Screen onRefresh={() => own.refetch()}>
      <Text variant="display">Menu</Text>
      <Text muted>Nascondi una voce solo in questo negozio. La tab bar mostra comunque al massimo cinque voci.</Text>
      {menu.map((item) => (
        <Card key={`${item.placement}:${item.key}`} style={{ gap: 4 }}>
          <Text>{`${item.placement} · ${item.label}`}</Text>
          <Button label="Nascondi qui" tone="ghost" onPress={() => hide.mutate({ placement: item.placement, key: item.key, kind: item.kind, label: item.label })} />
        </Card>
      ))}
      {(own.data?.nav ?? []).map((item) => (
        <Card key={item.id} style={{ gap: 4 }}>
          <Text variant="caption">{`Override ${item.placement} · ${item.label ?? item.key}`}</Text>
          <Button label="Torna a ereditare" tone="secondary" onPress={() => restore.mutate(item.id)} />
        </Card>
      ))}
    </Screen>
  );
}
