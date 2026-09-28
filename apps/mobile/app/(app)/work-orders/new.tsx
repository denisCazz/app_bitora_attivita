import { workOrderSchema } from "@rapportini/shared";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { emptyWorkOrder, WorkOrderForm, workOrderBody, type WorkOrderDraft } from "../../../src/components/WorkOrderForm";
import { useManifest } from "../../../src/session";

interface Prefill {
  title?: string;
  customerId?: string;
  customerName?: string;
  assetId?: string;
  assetName?: string;
  scheduleId?: string;
}

export default function NewWorkOrderScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const prefill = useLocalSearchParams<Prefill & Record<string, string>>();
  const [draft, setDraft] = useState<WorkOrderDraft>(() => ({
    ...emptyWorkOrder,
    title: prefill.title ?? "",
    customerId: prefill.customerId ?? null,
    assetId: prefill.assetId ?? null,
    scheduleId: prefill.scheduleId ?? null,
  }));
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (values: WorkOrderDraft) => http.post("/work-orders", workOrderSchema.parse(workOrderBody(values))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-reminders"] });
      router.back();
    },
  });

  return (
    <Screen onBack={() => router.back()}>
      <Text variant="display">Nuovo {manifest.data?.tenant.terminology.workOrder.toLowerCase() ?? "intervento"}</Text>
      <WorkOrderForm value={draft} onChange={setDraft} names={{ customer: prefill.customerName, asset: prefill.assetName }} />
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
