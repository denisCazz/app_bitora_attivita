import { assetSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { Button, Card, EmptyState, Fab, Input, ListItem, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { RecordPicker } from "../../../src/components/RecordPicker";
import { CustomFields } from "../../../src/components/CustomFields";
import { QueryState } from "../../../src/components/States";
import { fromLocalInput } from "../../../src/format";
import { useManifest } from "../../../src/session";

interface Asset { id: string; name: string; type?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null; customer?: { name: string } | null }

export default function AssetsScreen() {
  const manifest = useManifest();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [customerQ, setCustomerQ] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const terms = manifest.data?.tenant.terminology;
  const types = manifest.data?.tenant.assetTypes ?? [];
  const query = useQuery({ queryKey: ["assets"], queryFn: () => http.get<Asset[]>("/assets") });
  const customers = useQuery({
    queryKey: ["customers", customerQ],
    queryFn: () => http.get<Array<{ id: string; name: string; city?: string | null }>>(`/customers?q=${encodeURIComponent(customerQ)}`),
    enabled: open,
  });
  const form = useForm({
    resolver: zodResolver(assetSchema),
    defaultValues: { name: "", type: "", brand: "", model: "", serialNumber: "", notes: "", customerId: "" },
  });
  const selectedType = form.watch("type");
  const selectedCustomer = form.watch("customerId");
  const save = useMutation({
    mutationFn: (values: { name: string; type?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null; notes?: string | null; customerId?: string | null }) => {
      const installed = fromLocalInput(installedAt);
      if (installedAt.trim() && !installed) throw new Error("Data installazione non valida");
      return http.post("/assets", { ...values, customerId: values.customerId || null, installedAt: installed, customFields: custom });
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({ name: "", type: "", brand: "", model: "", serialNumber: "", notes: "", customerId: "" });
      setInstalledAt("");
      setCustom({});
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">{terms?.assets ?? "Impianti"}</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((asset) => (
            <Card key={asset.id}>
              <ListItem
                title={asset.name}
                subtitle={[asset.type, asset.customer?.name, asset.brand, asset.model, asset.serialNumber].filter(Boolean).join(" · ")}
                onPress={() => router.push(`/(app)/assets/${asset.id}`)}
              />
            </Card>
          ))
        ) : (
          <EmptyState title="Nessuna scheda" message={`Aggiungi il primo ${(terms?.asset ?? "impianto").toLowerCase()}.`} />
        )}
      </QueryState>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title={`Nuovo ${(terms?.asset ?? "impianto").toLowerCase()}`} onClose={() => setOpen(false)}>
        <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="type" render={({ field }) => <Input label="Tipo" value={field.value ?? ""} onChangeText={field.onChange} />} />
        {types.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {types.map((type) => (
              <Chip key={type} label={type} active={selectedType === type} onPress={() => form.setValue("type", selectedType === type ? "" : type)} />
            ))}
          </View>
        ) : null}
        <Controller control={form.control} name="brand" render={({ field }) => <Input label="Marca" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="model" render={({ field }) => <Input label="Modello" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="serialNumber" render={({ field }) => <Input label="Matricola" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Input label="Installato il" value={installedAt} onChangeText={setInstalledAt} />
        <Controller control={form.control} name="notes" render={({ field }) => <Input label="Note" value={field.value ?? ""} onChangeText={field.onChange} multiline />} />
        <RecordPicker
          label={terms?.customer ?? "Cliente"}
          query={customerQ}
          onQuery={setCustomerQ}
          options={(customers.data ?? []).map((customer) => ({ id: customer.id, title: customer.name, subtitle: customer.city ?? undefined }))}
          value={selectedCustomer || null}
          onChange={(id) => form.setValue("customerId", id ?? "")}
        />
        <CustomFields entity="ASSET" fields={manifest.data?.customFields ?? []} values={custom} onChange={setCustom} />
        {save.error ? <Text>{save.error.message}</Text> : null}
        <Button label="Salva scheda" loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} />
      </Sheet>
    </Screen>
  );
}
