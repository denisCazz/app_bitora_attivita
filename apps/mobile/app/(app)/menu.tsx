import { menuItemSchema, modifierSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { Button, Card, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { Chip } from "../../src/components/Chip";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";
import { euro } from "../../src/format";

interface Item {
  id: string;
  name: string;
  category: string;
  station: string;
  price: string | number;
  modifiers: Array<{ modifier: { name: string } }>;
}

export default function MenuScreen() {
  const [open, setOpen] = useState(false);
  const [station, setStation] = useState<"" | "BAR" | "KITCHEN" | "OTHER">("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const query = useQuery({ queryKey: ["menu"], queryFn: () => http.get<Item[]>("/menu-items") });
  const form = useForm({ resolver: zodResolver(menuItemSchema), defaultValues: { name: "", category: "", price: 0 } });
  const modifierForm = useForm({ resolver: zodResolver(modifierSchema), defaultValues: { name: "", priceDelta: 0 } });
  const save = useMutation({
    mutationFn: (values: { name: string; category: string; price: number }) =>
      http.post("/menu-items", { ...values, station: station || undefined, available: available ?? undefined }),
    onSuccess: async () => {
      setOpen(false);
      setStation("");
      setAvailable(null);
      form.reset({ name: "", category: "", price: 0 });
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
  });
  const addModifier = useMutation({
    mutationFn: (values: { name: string; priceDelta: number }) => http.post("/modifiers", values),
    onSuccess: () => modifierForm.reset(),
  });

  return (
    <Screen>
      <Text variant="display">Menu</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.map((item) => (
          <Card key={item.id} style={{ gap: 6 }}>
            <Text variant="heading">{item.name}</Text>
            <Text muted>
              {[item.category, item.station === "BAR" ? "Bar" : item.station === "KITCHEN" ? "Cucina" : item.station === "OTHER" ? "Altro" : "", euro(item.price)].filter(Boolean).join(" · ")}
            </Text>
            {item.modifiers.length ? <Text muted>Varianti: {item.modifiers.map((row) => row.modifier.name).join(", ")}</Text> : null}
          </Card>
        ))}
      </QueryState>
      <Card style={{ gap: 10 }}>
        <Text variant="heading">Nuova variante</Text>
        <Controller control={modifierForm.control} name="name" render={({ field }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} />} />
        <Controller
          control={modifierForm.control}
          name="priceDelta"
          render={({ field }) => <Input label="Variazione prezzo" keyboardType="decimal-pad" value={field.value ? String(field.value) : ""} onChangeText={(text) => field.onChange(Number(text.replace(",", ".")) || 0)} />}
        />
        <Button label="Aggiungi variante" tone="secondary" onPress={modifierForm.handleSubmit((values) => addModifier.mutate(values))} />
      </Card>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Nuova voce" onClose={() => setOpen(false)}>
        <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="category" render={({ field, fieldState }) => <Input label="Categoria" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="price" render={({ field }) => <Input label="Prezzo" keyboardType="decimal-pad" value={field.value ? String(field.value) : ""} onChangeText={(text) => field.onChange(Number(text.replace(",", ".")) || 0)} />} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              ["BAR", "Bar"],
              ["KITCHEN", "Cucina"],
              ["OTHER", "Altro"],
            ] as const
          ).map(([value, label]) => (
            <Chip key={value} label={label} active={station === value} onPress={() => setStation(station === value ? "" : value)} />
          ))}
          <Chip label="Disponibile" active={available === true} onPress={() => setAvailable(available === true ? null : true)} />
          <Chip label="Non disponibile" active={available === false} onPress={() => setAvailable(available === false ? null : false)} />
        </View>
        <Button label="Salva" loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} />
      </Sheet>
    </Screen>
  );
}
