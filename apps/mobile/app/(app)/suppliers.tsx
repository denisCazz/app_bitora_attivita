import { purchaseOrderSchema, supplierSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button, Card, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";

interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  orders: Array<{ id: string; status: string; lines: Array<{ id: string; description: string; quantity: string | number }> }>;
}

export default function SuppliersScreen() {
  const [open, setOpen] = useState(false);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const query = useQuery({ queryKey: ["suppliers"], queryFn: () => http.get<Supplier[]>("/suppliers") });
  const locations = useQuery({ queryKey: ["stock-locations"], queryFn: () => http.get<Array<{ id: string; name: string; kind: string }>>("/stock/locations") });
  const form = useForm({ resolver: zodResolver(supplierSchema), defaultValues: { name: "", phone: "", email: "", notes: "" } });
  const save = useMutation({
    mutationFn: (values: { name: string; phone?: string | null; email?: string | null }) => http.post("/suppliers", values),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const order = useMutation({
    mutationFn: () => {
      if (!ordering) throw new Error("Fornitore mancante");
      const body = purchaseOrderSchema.parse({
        supplierId: ordering,
        lines: [{ description: description.trim(), quantity: Number(quantity.replace(",", ".")) || 0, unitPrice: Number(price.replace(",", ".")) || 0 }],
      });
      return http.post<{ id: string }>("/purchase-orders", body);
    },
    onSuccess: async () => {
      setOrdering(null);
      setDescription("");
      setQuantity("");
      setPrice("");
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const receive = useMutation({
    mutationFn: (orderId: string) => http.post(`/purchase-orders/${orderId}/receive`, { locationId: locations.data?.find((location) => location.kind === "KITCHEN")?.id ?? locations.data?.[0]?.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["balances"] }),
  });

  return (
    <Screen>
      <Text variant="display">Fornitori</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.map((supplier) => (
          <Card key={supplier.id} style={{ gap: 8 }}>
            <Text variant="heading">{supplier.name}</Text>
            <Text muted>{supplier.phone}</Text>
            {supplier.orders.map((item) => (
              <Text key={item.id} muted>
                Ordine {item.status}: {item.lines.map((line) => line.description).join(", ")}
              </Text>
            ))}
            <Button label="Nuovo ordine" tone="secondary" onPress={() => setOrdering(supplier.id)} />
            {supplier.orders[0] && supplier.orders[0].status !== "RECEIVED" ? <Button label="Ricevi in cucina" onPress={() => receive.mutate(supplier.orders[0]!.id)} /> : null}
          </Card>
        ))}
      </QueryState>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Fornitore" onClose={() => setOpen(false)}>
        <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="phone" render={({ field }) => <Input label="Telefono" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Controller control={form.control} name="email" render={({ field, fieldState }) => <Input label="Email" value={field.value ?? ""} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="notes" render={({ field }) => <Input label="Note" value={field.value ?? ""} onChangeText={field.onChange} multiline />} />
        <Button label="Salva" loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} />
      </Sheet>
      <Sheet visible={Boolean(ordering)} title="Ordine" onClose={() => setOrdering(null)}>
        <Input label="Cosa ordini" value={description} onChangeText={setDescription} />
        <Input label="Quantità" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
        <Input label="Prezzo" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
        {order.error ? <Text>{order.error.message}</Text> : null}
        <Button label="Crea ordine" loading={order.isPending} disabled={description.trim().length < 1 || !quantity.trim()} onPress={() => order.mutate()} />
      </Sheet>
    </Screen>
  );
}
