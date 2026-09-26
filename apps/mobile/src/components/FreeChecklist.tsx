import { useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Input, Pressy, Text, useTheme } from "@rapportini/ui";
import { http } from "../api/client";
import { queryClient } from "../api/query";

export function FreeChecklist({ workOrderId, onSaved, embedded }: { workOrderId?: string; onSaved?: () => void; embedded?: boolean }) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(!embedded);
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

  const fields = (
    <>
      <Input label="Titolo" value={title} onChangeText={setTitle} placeholder="Es. Controllo di oggi" />
      <Input label="Testo" value={text} onChangeText={setText} multiline placeholder="Scrivi cosa hai fatto" style={{ minHeight: 100, textAlignVertical: "top", paddingTop: 14 }} />
      {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error.message}</Text> : null}
      {save.isSuccess ? <Text variant="caption" muted>Salvato.</Text> : null}
      <Button label="Salva testo" loading={save.isPending} disabled={text.trim().length < 2} onPress={() => save.mutate()} />
    </>
  );

  if (embedded) {
    return (
      <View style={{ gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.line, paddingTop: 12 }}>
        <Pressy onPress={() => setOpen((value) => !value)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name={open ? "remove-circle-outline" : "add-circle-outline"} size={18} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.accent, fontWeight: "600", flex: 1 }}>Nota libera, senza modello</Text>
        </Pressy>
        {open ? fields : null}
      </View>
    );
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text variant="heading">Scrivi senza modello</Text>
      <Text variant="caption" muted>
        Vale solo per questa volta. I modelli restano in Impostazioni.
      </Text>
      {fields}
    </Card>
  );
}
