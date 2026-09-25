import { ingredientSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button, Card, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";

interface Ingredient { id: string; name: string; unit: string; sku?: string | null }
interface Balance { quantity: number; ingredientId?: string | null; ingredient?: { name: string; unit: string } | null; location?: { name: string } | null }

export default function InventoryScreen() {
  const [open, setOpen] = useState(false);
  const ingredients = useQuery({ queryKey: ["ingredients"], queryFn: () => http.get<Ingredient[]>("/ingredients") });
  const balances = useQuery({ queryKey: ["balances"], queryFn: () => http.get<Balance[]>("/stock/balances") });
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => http.get<Array<{ id: string; name: string }>>("/menu-items") });
  const form = useForm({ resolver: zodResolver(ingredientSchema), defaultValues: { name: "", unit: "", sku: "" } });
  const save = useMutation({
    mutationFn: (values: { name: string; unit: string; sku?: string | null }) => http.post("/ingredients", values),
    onSuccess: async () => {
      setOpen(false);
      form.reset({ name: "", unit: "", sku: "" });
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
  const [dishId, setDishId] = useState<string | null>(null);
  const [ingredientId, setIngredientId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const recipe = useMutation({
    mutationFn: () => {
      const amount = Number(quantity.replace(",", "."));
      if (!dishId || !ingredientId || !(amount > 0)) throw new Error("Scrivi quantità, ingrediente e piatto");
      return http.put("/recipes", { menuItemId: dishId, lines: [{ ingredientId, quantity: amount }] });
    },
    onSuccess: () => {
      setDishId(null);
      setIngredientId(null);
      setQuantity("");
    },
  });

  return (
    <Screen>
      <Text variant="display">Magazzino</Text>
      <Text muted>Le ricette scaricano gli ingredienti quando chiudi il conto.</Text>
      <QueryState isLoading={ingredients.isLoading} error={ingredients.error} refetch={() => ingredients.refetch()}>
        {ingredients.data?.map((item) => {
          const qty = balances.data?.filter((row) => row.ingredientId === item.id).reduce((sum, row) => sum + row.quantity, 0) ?? 0;
          return (
            <Card key={item.id} style={{ gap: 4 }}>
              <Text variant="heading">{item.name}</Text>
              <Text muted>
                {qty} {item.unit} {item.sku ? `· ${item.sku}` : ""}
              </Text>
            </Card>
          );
        })}
      </QueryState>
      <Card style={{ gap: 10 }}>
        <Text variant="heading">Ricetta</Text>
        <Input label="Quantità" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
        <Text variant="caption" muted>
          Ingrediente
        </Text>
        {ingredients.data?.map((item) => (
          <Button key={item.id} label={item.name} tone={ingredientId === item.id ? "primary" : "secondary"} onPress={() => setIngredientId(item.id)} />
        ))}
        <Text variant="caption" muted>
          Piatto
        </Text>
        {menu.data?.map((item) => (
          <Button key={item.id} label={item.name} tone={dishId === item.id ? "primary" : "secondary"} onPress={() => setDishId(item.id)} />
        ))}
        {recipe.error ? <Text>{recipe.error.message}</Text> : null}
        <Button label="Salva ricetta" tone="secondary" loading={recipe.isPending} disabled={!dishId || !ingredientId || !quantity.trim()} onPress={() => recipe.mutate()} />
      </Card>
      <Fab onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Ingrediente" onClose={() => setOpen(false)}>
        <Controller control={form.control} name="name" render={({ field, fieldState }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="unit" render={({ field, fieldState }) => <Input label="Unità" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={form.control} name="sku" render={({ field }) => <Input label="SKU" value={field.value ?? ""} onChangeText={field.onChange} />} />
        <Button label="Salva" loading={save.isPending} onPress={form.handleSubmit((values) => save.mutate(values))} />
      </Sheet>
    </Screen>
  );
}
