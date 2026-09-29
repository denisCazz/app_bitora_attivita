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
import { fieldText, useFields, useManifest } from "../../../src/session";

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
  const fields = useFields("customer");
  const text = (key: string, fallback: string) => fieldText(fields, key, fallback);

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
        <Controller control={form.control} name="name" render={({ field, fieldState }) => (text("name", "Nome") ? <Input label={text("name", "Nome")!} value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} /> : <></>)} />
        <Controller control={form.control} name="phone" render={({ field }) => (text("phone", "Telefono") ? <Input label={text("phone", "Telefono")!} value={field.value ?? ""} onChangeText={field.onChange} /> : <></>)} />
        <Controller control={form.control} name="email" render={({ field, fieldState }) => (text("email", "Email") ? <Input label={text("email", "Email")!} value={field.value ?? ""} onChangeText={field.onChange} error={fieldState.error?.message} /> : <></>)} />
        <Controller control={form.control} name="address" render={({ field }) => (text("address", "Indirizzo") ? <Input label={text("address", "Indirizzo")!} value={field.value ?? ""} onChangeText={field.onChange} /> : <></>)} />
        <Controller control={form.control} name="city" render={({ field }) => (text("city", "Città") ? <Input label={text("city", "Città")!} value={field.value ?? ""} onChangeText={field.onChange} /> : <></>)} />
        <Controller control={form.control} name="notes" render={({ field }) => (text("notes", "Note") ? <Input label={text("notes", "Note")!} value={field.value ?? ""} onChangeText={field.onChange} multiline /> : <></>)} />
        <CustomFields entity="CUSTOMER" fields={manifest.data?.customFields ?? []} values={custom} onChange={setCustom} />
        <Button label={t("save")} loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} />
      </Sheet>
    </Screen>
  );
}
