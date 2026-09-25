import { sparePartSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button, Card, EmptyState, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { QueryState } from "../../../src/components/States";
import { euro } from "../../../src/format";

interface Part { id: string; sku: string; name: string; brand?: string | null; barcode?: string | null; unitPrice: string | number; compatibleModels: string[] }

export default function PartsScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [model, setModel] = useState("");
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["parts", q, model],
    queryFn: () => http.get<Part[]>(`/spare-parts?q=${encodeURIComponent(q)}&model=${encodeURIComponent(model)}`),
  });
  const form = useForm({ resolver: zodResolver(sparePartSchema), defaultValues: { sku: "", name: "", brand: "", barcode: "", unitPrice: 0, compatibleModels: [] as string[] } });
  const save = useMutation({
    mutationFn: (values: { sku: string; name: string; brand?: string | null; barcode?: string | null; unitPrice: number; compatibleModels: string[] }) => http.post("/spare-parts", values),
    onSuccess: async () => {
      setOpen(false);
      form.reset({ sku: "", name: "", brand: "", barcode: "", unitPrice: 0, compatibleModels: [] });
      await queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });

  return (
    <Screen>
      <Text variant="display">Ricambi</Text>
      <Input label="Cerca nome o codice" value={q} onChangeText={setQ} />
      <Input label="Compatibile con il modello" value={model} onChangeText={setModel} />
      <Button label="Scansiona codice" tone="secondary" onPress={() => router.push("/(app)/parts/scan")} />
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((part) => (
            <Card key={part.id} style={{ gap: 4 }}>
              <Text variant="heading">{part.name}</Text>
              <Text muted>
                {part.sku} · {euro(part.unitPrice)} · {part.compatibleModels.join(", ")}
              </Text>
            </Card>
          ))
        ) : (
          <EmptyState title="Nessun ricambio" message="Il catalogo è vuoto per questa ricerca." />
        )}
      </QueryState>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Nuovo ricambio" onClose={() => setOpen(false)}>
        <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="sku" render={({ field, fieldState }) => <Input label="SKU" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="brand" render={({ field }) => <Input label="Marca" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="barcode" render={({ field }) => <Input label="Barcode" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller
          control={form.control}
          name="unitPrice"
          render={({ field }) => <Input label="Prezzo" keyboardType="decimal-pad" value={field.value ? String(field.value) : ""} onChangeText={(text) => field.onChange(Number(text.replace(",", ".")) || 0)} />}
        />
        <Controller
          control={form.control}
          name="compatibleModels"
          render={({ field }) => <Input label="Modelli compatibili" value={(field.value ?? []).join(", ")} onChangeText={(text) => field.onChange(text.split(",").map((item) => item.trim()).filter(Boolean))} />}
        />
        {save.error ? <Text>{save.error.message}</Text> : null}
        <Button
          label="Salva"
          loading={save.isPending}
          onPress={form.handleSubmit((values) => save.mutate(values))}
        />
      </Sheet>
    </Screen>
  );
}
