import { customerSchema } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, Card, Input, ListItem, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { QueryState } from "../../../src/components/States";
import { STATUS_LABEL } from "../../../src/format";

interface CustomerDetail {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  assets: Array<{ id: string; name: string; brand?: string | null; model?: string | null }>;
  workOrders: Array<{ id: string; title: string; status: string }>;
}

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", address: "", city: "", notes: "" });
  const query = useQuery({ queryKey: ["customer", id], queryFn: () => http.get<CustomerDetail>(`/customers/${id}`) });
  const save = useMutation({
    mutationFn: () => http.patch(`/customers/${id}`, customerSchema.parse(draft)),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["customer", id] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  return (
    <Screen onBack={() => router.back()} backLabel="Clienti">
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data ? (
          <>
            <Text variant="display">{query.data.name}</Text>
            <Text muted>{[query.data.address, query.data.city, query.data.phone, query.data.email].filter(Boolean).join(" · ")}</Text>
            {query.data.notes ? <Text>{query.data.notes}</Text> : null}
            <Button
              label="Modifica"
              tone="secondary"
              onPress={() => {
                setDraft({
                  name: query.data?.name ?? "",
                  phone: query.data?.phone ?? "",
                  email: query.data?.email ?? "",
                  address: query.data?.address ?? "",
                  city: query.data?.city ?? "",
                  notes: query.data?.notes ?? "",
                });
                setOpen(true);
              }}
            />
            <Sheet visible={open} title="Modifica cliente" onClose={() => setOpen(false)}>
              <Input label="Nome" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
              <Input label="Telefono" value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} />
              <Input label="Email" value={draft.email} onChangeText={(email) => setDraft({ ...draft, email })} />
              <Input label="Indirizzo" value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} />
              <Input label="Città" value={draft.city} onChangeText={(city) => setDraft({ ...draft, city })} />
              <Input label="Note" value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline />
              {save.error ? <Text>{save.error.message}</Text> : null}
              <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
            </Sheet>
            <Text variant="title">Impianti</Text>
            {query.data.assets.map((asset) => (
              <Card key={asset.id}>
                <ListItem title={asset.name} subtitle={`${asset.brand ?? ""} ${asset.model ?? ""}`} onPress={() => router.push(`/(app)/assets/${asset.id}`)} />
              </Card>
            ))}
            <Text variant="title">Storico</Text>
            {query.data.workOrders.map((order) => (
              <Card key={order.id}>
                <ListItem title={order.title} subtitle={STATUS_LABEL[order.status] ?? order.status} onPress={() => router.push(`/(app)/work-orders/${order.id}`)} />
              </Card>
            ))}
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}
