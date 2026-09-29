import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, Screen, Text } from "@rapportini/ui";
import { http } from "../../../../src/api/client";
import { queryClient } from "../../../../src/api/query";
import { EntityForm } from "../../../../src/components/EntityForm";
import { useEntity } from "../../../../src/session";

export default function NewRecordScreen() {
  const { module } = useLocalSearchParams<{ module: string }>();
  const entity = useEntity(module);
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => http.post(`/entities/${module}/records`, { fields: values, title: values[entity?.titleFieldKey ?? "name"] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["records", module] });
      router.back();
    },
  });

  return (
    <Screen>
      <Text variant="display">{`Nuovo ${entity?.label.toLowerCase() ?? "record"}`}</Text>
      <EntityForm fields={entity?.fields ?? []} values={values} onChange={setValues} />
      {save.error ? <Text>{save.error.message}</Text> : null}
      <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
    </Screen>
  );
}
