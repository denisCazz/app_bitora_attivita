import { customerSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button, Card, EmptyState, Fab, Input, ListItem, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { CustomFields } from "../../../src/components/CustomFields";
import { QueryState } from "../../../src/components/States";
import { t } from "../../../src/i18n";
import { useManifest } from "../../../src/session";

interface Customer { id: string; name: string; phone?: string | null; city?: string | null }

export default function CustomersScreen() {
  const manifest = useManifest();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ["customers"], queryFn: () => http.get<Customer[]>("/customers") });
  const form = useForm({ resolver: zodResolver(customerSchema), defaultValues: { name: "", phone: "", email: "", address: "", city: "", notes: "" } });
  const save = useMutation({
    mutationFn: (values: { name: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; notes?: string | null }) =>
      http.post("/customers", { ...values, customFields: custom }),
    onSuccess: async () => {
      setOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  const label = manifest.data?.tenant.terminology.customers ?? "Clienti";

  return (
    <Screen onRefresh={() => query.refetch()}>
      <Text variant="display">{label}</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((customer) => (
            <Card key={customer.id}>
              <ListItem title={customer.name} subtitle={[customer.city, customer.phone].filter(Boolean).join(" · ")} onPress={() => router.push(`/(app)/customers/${customer.id}`)} />
            </Card>
          ))
        ) : (
          <EmptyState title={t("emptyTitle")} message="Aggiungi il primo cliente." />
        )}
      </QueryState>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title={`Nuovo ${manifest.data?.tenant.terminology.customer.toLowerCase() ?? "cliente"}`} onClose={() => setOpen(false)}>
        <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="phone" render={({ field }) => <Input label="Telefono" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="email" render={({ field, fieldState }) => <Input label="Email" value={field.value ?? ""} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="address" render={({ field }) => <Input label="Indirizzo" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="city" render={({ field }) => <Input label="Città" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="notes" render={({ field }) => <Input label="Note" value={field.value ?? ""} onChangeText={field.onChange} multiline />} />
        <CustomFields entity="CUSTOMER" fields={manifest.data?.customFields ?? []} values={custom} onChange={setCustom} />
        <Button label={t("save")} loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} />
      </Sheet>
    </Screen>
  );
}
