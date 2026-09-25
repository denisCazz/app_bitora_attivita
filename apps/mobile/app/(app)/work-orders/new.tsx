import { workOrderSchema } from "@rapportini/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Button, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { emptyWorkOrder, WorkOrderForm, workOrderBody, type WorkOrderDraft } from "../../../src/components/WorkOrderForm";
import { useManifest } from "../../../src/session";

export default function NewWorkOrderScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const [draft, setDraft] = useState<WorkOrderDraft>(emptyWorkOrder);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (values: WorkOrderDraft) => http.post("/work-orders", workOrderSchema.parse(workOrderBody(values))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      router.back();
    },
  });

  return (
    <Screen onBack={() => router.back()}>
      <Text variant="display">Nuovo {manifest.data?.tenant.terminology.workOrder.toLowerCase() ?? "intervento"}</Text>
      <WorkOrderForm value={draft} onChange={setDraft} />
      {error || save.error ? <Text>{error || save.error?.message}</Text> : null}
      <Button
        label="Crea"
        loading={save.isPending}
        onPress={() => {
          try {
            setError("");
            save.mutate(draft);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Controlla i campi");
          }
        }}
      />
    </Screen>
  );
}
