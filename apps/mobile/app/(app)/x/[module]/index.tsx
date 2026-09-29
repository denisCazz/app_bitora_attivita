import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { EmptyState, Fab, Input, ListItem, Screen, Text } from "@rapportini/ui";
import { http } from "../../../../src/api/client";
import { QueryState } from "../../../../src/components/States";
import { useEntity } from "../../../../src/session";

interface Row {
  id: string;
  title: string;
  fields: Record<string, string>;
}

export default function EntityListScreen() {
  const { module } = useLocalSearchParams<{ module: string }>();
  const entity = useEntity(module);
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["records", module, q],
    queryFn: () => http.get<Row[]>(`/entities/${module}/records?q=${encodeURIComponent(q)}`),
    enabled: Boolean(module),
  });
  const listFields = (entity?.fields ?? []).filter((field) => field.showInList && field.key !== entity?.titleFieldKey);

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">{entity?.labelPlural ?? "Record"}</Text>
      <Input label="Cerca" value={q} onChangeText={setQ} />
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((row) => (
            <ListItem
              key={row.id}
              title={row.title || "Senza titolo"}
              subtitle={listFields.map((field) => row.fields[field.key]).filter(Boolean).join(" · ") || undefined}
              onPress={() => router.push(`/(app)/x/${module}/${row.id}` as never)}
            />
          ))
        ) : (
          <EmptyState title="Niente qui" message={`Aggiungi il primo ${entity?.label.toLowerCase() ?? "record"}.`} />
        )}
      </QueryState>
      <Fab onPress={() => router.push(`/(app)/x/${module}/new` as never)} />
    </Screen>
  );
}
