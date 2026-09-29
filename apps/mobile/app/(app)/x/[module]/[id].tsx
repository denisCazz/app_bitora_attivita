import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Screen, Text } from "@rapportini/ui";
import { http } from "../../../../src/api/client";
import { queryClient } from "../../../../src/api/query";
import { EntityForm } from "../../../../src/components/EntityForm";
import { QueryState } from "../../../../src/components/States";
import { useEntity } from "../../../../src/session";

interface RecordRow {
  id: string;
  title: string;
  fields: Record<string, string>;
}

export default function RecordScreen() {
  const { module, id } = useLocalSearchParams<{ module: string; id: string }>();
  const entity = useEntity(module);
  const router = useRouter();
  const query = useQuery({
    queryKey: ["records", module, id],
    queryFn: () => http.get<RecordRow>(`/entities/${module}/records/${id}`),
    enabled: Boolean(module && id),
  });
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (query.data) setValues(query.data.fields);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => http.patch(`/entities/${module}/records/${id}`, { fields: values, title: values[entity?.titleFieldKey ?? "name"] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["records", module] });
    },
  });
  const remove = useMutation({
    mutationFn: () => http.del(`/entities/${module}/records/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["records", module] });
      router.back();
    },
  });

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">{query.data?.title || entity?.label || "Record"}</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        <EntityForm fields={entity?.fields ?? []} values={values} onChange={setValues} />
        {save.error ? <Text>{save.error.message}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
        <Button label="Elimina" tone="danger" loading={remove.isPending} onPress={() => remove.mutate()} />
      </QueryState>
    </Screen>
  );
}
