import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Input, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";

interface VocabRow { id: string; listKey: string; key: string; label: string; visible: boolean }

export default function ShopVocabScreen() {
  const config = useQuery({ queryKey: ["shop-config"], queryFn: () => http.get<{ vocab: VocabRow[] }>("/settings/config") });
  const [listKey, setListKey] = useState("asset_types");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const save = useMutation({
    mutationFn: () => http.put("/settings/vocab", { listKey, key, label, visible: true }),
    onSuccess: async () => {
      setKey("");
      setLabel("");
      await queryClient.invalidateQueries({ queryKey: ["shop-config"] });
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/settings/vocab/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shop-config"] });
      await queryClient.invalidateQueries({ queryKey: ["manifest"] });
    },
  });

  return (
    <Screen onRefresh={() => config.refetch()}>
      <Text variant="display">Vocabolari</Text>
      <Text muted>Una voce qui vale solo per questo negozio. Eliminarla fa tornare il valore della categoria.</Text>
      {(config.data?.vocab ?? []).map((item) => (
        <Card key={item.id} style={{ gap: 4 }}>
          <Text>{`${item.listKey} · ${item.label}`}</Text>
          <Button label="Torna a ereditare" tone="ghost" onPress={() => remove.mutate(item.id)} />
        </Card>
      ))}
      <Input label="Lista" value={listKey} onChangeText={setListKey} autoCapitalize="none" />
      <Input label="Chiave" value={key} onChangeText={setKey} autoCapitalize="none" />
      <Input label="Etichetta" value={label} onChangeText={setLabel} />
      <Button label="Salva override" loading={save.isPending} onPress={() => save.mutate()} />
      {save.error ? <Text>{save.error.message}</Text> : null}
    </Screen>
  );
}
