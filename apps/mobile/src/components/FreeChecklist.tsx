import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Input, Text, useTheme } from "@rapportini/ui";
import { http } from "../api/client";
import { queryClient } from "../api/query";

export function FreeChecklist({ workOrderId, onSaved }: { workOrderId?: string; onSaved?: () => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const save = useMutation({
    mutationFn: () =>
      http.post("/checklist-runs", {
        templateId: null,
        workOrderId: workOrderId ?? null,
        completed: true,
        answers: [{ id: "free", label: title.trim() || "Note", checked: true, note: text.trim() }],
      }),
    onSuccess: async () => {
      setTitle("");
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["checklists"] });
      await queryClient.invalidateQueries({ queryKey: ["checklist-runs"] });
      if (workOrderId) await queryClient.invalidateQueries({ queryKey: ["work-order", workOrderId] });
      onSaved?.();
    },
  });

  return (
    <Card style={{ gap: 10 }}>
      <Text variant="heading">Scrivi senza modello</Text>
      <Text variant="caption" muted>
        Vale solo per questa volta. I modelli restano in Impostazioni.
      </Text>
      <Input label="Titolo" value={title} onChangeText={setTitle} placeholder="Es. Controllo di oggi" />
      <Input label="Testo" value={text} onChangeText={setText} multiline placeholder="Scrivi cosa hai fatto" style={{ minHeight: 100, textAlignVertical: "top", paddingTop: 14 }} />
      {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error.message}</Text> : null}
      {save.isSuccess ? <Text variant="caption" muted>Salvato.</Text> : null}
      <Button label="Salva testo" loading={save.isPending} disabled={text.trim().length < 2} onPress={() => save.mutate()} />
    </Card>
  );
}
