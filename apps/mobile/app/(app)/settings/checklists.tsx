import { useRouter } from "expo-router";
import { checklistTemplateSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Input, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";

interface Template { id: string; name: string; kind: string; items: Array<{ id: string; label: string }> }

export default function ChecklistSettingsScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [item, setItem] = useState("");
  const [items, setItems] = useState<Array<{ id: string; label: string }>>([]);
  const query = useQuery({ queryKey: ["checklists"], queryFn: () => http.get<Template[]>("/checklist-templates") });
  const save = useMutation({
    mutationFn: () => http.post("/checklist-templates", checklistTemplateSchema.parse({ name, kind: "GENERIC", items })),
    onSuccess: async () => {
      setName("");
      setItems([]);
      await queryClient.invalidateQueries({ queryKey: ["checklists"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/checklist-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists"] }),
  });

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Modelli checklist</Text>
      {query.data?.map((template) => (
        <Card key={template.id} style={{ gap: 6 }}>
          <Text variant="heading">{template.name}</Text>
          {template.items.map((row) => (
            <Text key={row.id} muted>
              · {row.label}
            </Text>
          ))}
          <Button label="Elimina" tone="danger" onPress={() => remove.mutate(template.id)} />
        </Card>
      ))}
      <Input label="Nome modello" value={name} onChangeText={setName} />
      <Input label="Voce" value={item} onChangeText={setItem} />
      <Button
        label="Aggiungi voce"
        tone="secondary"
        onPress={() => {
          if (!item.trim()) return;
          setItems((current) => [...current, { id: `i${current.length + 1}`, label: item.trim() }]);
          setItem("");
        }}
      />
      {items.map((row) => (
        <Text key={row.id}>· {row.label}</Text>
      ))}
      {save.error ? <Text>{save.error.message}</Text> : null}
      <Button label="Salva modello" disabled={!items.length} onPress={() => save.mutate()} />
    </Screen>
  );
}
