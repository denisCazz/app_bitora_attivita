import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Screen, Text, useTheme } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { FreeChecklist } from "../../src/components/FreeChecklist";
import { QueryState } from "../../src/components/States";

interface Template { id: string; name: string; kind: string; items: Array<{ id: string; label: string }> }
interface Run { id: string; template: { name: string } | null; answers: Array<{ label?: string; note?: string; checked?: boolean }> }

export default function ChecklistsScreen() {
  const theme = useTheme();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["checklists"], queryFn: () => http.get<Template[]>("/checklist-templates") });
  const runs = useQuery({ queryKey: ["checklist-runs"], queryFn: () => http.get<Run[]>("/checklist-runs") });
  const run = useMutation({
    mutationFn: (template: Template) =>
      http.post("/checklist-runs", {
        templateId: template.id,
        completed: true,
        answers: template.items.map((item) => ({
          id: item.id,
          label: item.label,
          checked: Boolean(checks[`${template.id}:${item.id}`]),
        })),
      }),
    onSuccess: async (_data, template) => {
      setSavedId(template.id);
      setChecks((current) => {
        const next = { ...current };
        for (const item of template.items) delete next[`${template.id}:${item.id}`];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["checklist-runs"] });
    },
  });
  const notes = runs.data?.filter((entry) => !entry.template) ?? [];
  const registered = runs.data?.filter((entry) => entry.template) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">Checklist</Text>
      <FreeChecklist onSaved={() => void runs.refetch()} />
      {notes.map((entry) => (
        <Card key={entry.id} style={{ gap: 4 }}>
          <Text variant="heading">{entry.answers[0]?.label || "Note"}</Text>
          <Text>{entry.answers.map((answer) => answer.note || answer.label).filter(Boolean).join("\n")}</Text>
        </Card>
      ))}
      {registered.map((entry) => (
        <Card key={entry.id} style={{ gap: 4 }}>
          <Text variant="heading">{entry.template?.name}</Text>
          {entry.answers.map((answer, index) => (
            <Text key={index}>
              <Text muted={!answer.checked}>{answer.checked ? "Eseguito" : "Non eseguito"}</Text>
              {` · ${answer.label || "Voce"}`}
            </Text>
          ))}
        </Card>
      ))}
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.map((template) => {
          const pending = run.isPending && run.variables?.id === template.id;
          const failed = run.isError && run.variables?.id === template.id;
          return (
            <Card key={template.id} style={{ gap: 8 }}>
              <Text variant="heading">{template.name}</Text>
              {template.items.map((item) => {
                const key = `${template.id}:${item.id}`;
                return (
                  <Button
                    key={item.id}
                    label={`${checks[key] ? "✓ " : ""}${item.label}`}
                    tone={checks[key] ? "primary" : "secondary"}
                    onPress={() => {
                      setSavedId((current) => (current === template.id ? null : current));
                      setChecks((current) => ({ ...current, [key]: !current[key] }));
                    }}
                  />
                );
              })}
              {failed ? <Text style={{ color: theme.colors.danger }}>{run.error.message}</Text> : null}
              {savedId === template.id ? <Text variant="caption" muted>Registrata. La trovi nell’elenco sopra.</Text> : null}
              <Button label={savedId === template.id ? "Registra di nuovo" : "Completa"} loading={pending} onPress={() => run.mutate(template)} />
            </Card>
          );
        })}
      </QueryState>
    </Screen>
  );
}
