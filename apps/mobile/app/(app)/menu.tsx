import { menuItemSchema, modifierSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { Button, Card, EmptyState, Fab, Input, Screen, Sheet, Text } from "@rapportini/ui";
import { Chip } from "../../src/components/Chip";
import { http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { QueryState } from "../../src/components/States";
import { euro } from "../../src/format";
import { can, useManifest, useVocab, vocabLabel } from "../../src/session";

interface Modifier {
  id: string;
  name: string;
  priceDelta: string | number;
}

interface Item {
  id: string;
  name: string;
  category: string;
  station: string;
  price: string | number;
  available: boolean;
  modifiers: Array<{ modifier: { id: string; name: string } }>;
}

interface Draft {
  id?: string;
  name: string;
  category: string;
  price: string;
  station: string;
  available: boolean;
  modifierIds: string[];
}

const blank = (): Draft => ({ name: "", category: "", price: "", station: "", available: true, modifierIds: [] });

function priceText(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

export default function MenuScreen() {
  const manifest = useManifest();
  const writable = can(manifest.data, "menu.write");
  const { stations } = useVocab();
  const [draft, setDraft] = useState<Draft | null>(null);
  const query = useQuery({ queryKey: ["menu"], queryFn: () => http.get<Item[]>("/menu-items") });
  const modifiers = useQuery({ queryKey: ["modifiers"], queryFn: () => http.get<Modifier[]>("/modifiers"), enabled: Boolean(draft) });
  const modifierForm = useForm({ resolver: zodResolver(modifierSchema), defaultValues: { name: "", priceDelta: 0 } });
  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("Niente da salvare");
      const price = Number(draft.price.replace(",", "."));
      if (!Number.isFinite(price)) throw new Error("Scrivi il prezzo");
      const body = menuItemSchema.parse({
        name: draft.name,
        category: draft.category,
        price,
        station: draft.station || undefined,
        available: draft.available,
        modifierIds: draft.modifierIds,
      });
      return draft.id ? http.patch(`/menu-items/${draft.id}`, body) : http.post("/menu-items", body);
    },
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/menu-items/${id}`),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
  });
  const addModifier = useMutation({
    mutationFn: (values: { name: string; priceDelta: number }) => http.post("/modifiers", values),
    onSuccess: async () => {
      modifierForm.reset();
      await queryClient.invalidateQueries({ queryKey: ["modifiers"] });
    },
  });

  function openCreate() {
    save.reset();
    remove.reset();
    setDraft(blank());
  }

  function openEdit(item: Item) {
    save.reset();
    remove.reset();
    setDraft({
      id: item.id,
      name: item.name,
      category: item.category,
      price: priceText(item.price),
      station: item.station,
      available: item.available,
      modifierIds: item.modifiers.map((row) => row.modifier.id),
    });
  }

  function closeSheet() {
    setDraft(null);
    save.reset();
    remove.reset();
  }

  return (
    <Screen>
      <Text variant="display">Menu</Text>
      <QueryState isLoading={query.isLoading} error={query.error} refetch={() => query.refetch()}>
        {query.data?.length ? (
          query.data.map((item) => (
            <Card key={item.id} style={{ gap: 6 }}>
              <Text variant="heading">{item.name}</Text>
              <Text muted>
                {[item.category, stations.length > 1 ? vocabLabel(stations, item.station) : "", euro(item.price), item.available ? "" : "Non disponibile"]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {item.modifiers.length ? <Text muted>Varianti: {item.modifiers.map((row) => row.modifier.name).join(", ")}</Text> : null}
              {writable ? <Button label="Modifica" tone="secondary" onPress={() => openEdit(item)} /> : null}
            </Card>
          ))
        ) : (
          <EmptyState title="Menu vuoto" message="Aggiungi una voce con il pulsante +." />
        )}
      </QueryState>
      {writable ? (
        <Card style={{ gap: 10 }}>
          <Text variant="heading">Nuova variante</Text>
          <Controller control={modifierForm.control} name="name" render={({ field }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} />} />
          <Controller
            control={modifierForm.control}
            name="priceDelta"
            render={({ field }) => (
              <Input label="Variazione prezzo" keyboardType="decimal-pad" value={field.value ? String(field.value) : ""} onChangeText={(text) => field.onChange(Number(text.replace(",", ".")) || 0)} />
            )}
          />
          <Button label="Aggiungi variante" tone="secondary" onPress={modifierForm.handleSubmit((values) => addModifier.mutate(values))} />
        </Card>
      ) : null}
      {writable ? <Fab onPress={openCreate} /> : null}
      <Sheet visible={Boolean(draft)} title={draft?.id ? "Modifica voce" : "Nuova voce"} onClose={closeSheet}>
        <Input label="Nome" value={draft?.name ?? ""} onChangeText={(name) => setDraft((current) => (current ? { ...current, name } : current))} />
        <Input label="Categoria" value={draft?.category ?? ""} onChangeText={(category) => setDraft((current) => (current ? { ...current, category } : current))} />
        <Input
          label="Prezzo"
          keyboardType="decimal-pad"
          value={draft?.price ?? ""}
          onChangeText={(price) => setDraft((current) => (current ? { ...current, price } : current))}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {stations.length > 1
            ? stations.map(({ key, label }) => (
                <Chip
                  key={key}
                  label={label}
                  active={draft?.station === key}
                  onPress={() => setDraft((current) => (current ? { ...current, station: current.station === key ? "" : key } : current))}
                />
              ))
            : null}
          <Chip label="Disponibile" active={draft?.available === true} onPress={() => setDraft((current) => (current ? { ...current, available: true } : current))} />
          <Chip label="Non disponibile" active={draft?.available === false} onPress={() => setDraft((current) => (current ? { ...current, available: false } : current))} />
        </View>
        {modifiers.data?.length ? (
          <View style={{ gap: 8 }}>
            <Text variant="label">Varianti</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {modifiers.data.map((modifier) => (
                <Chip
                  key={modifier.id}
                  label={Number(modifier.priceDelta) ? `${modifier.name} ${euro(modifier.priceDelta)}` : modifier.name}
                  active={draft?.modifierIds.includes(modifier.id) ?? false}
                  onPress={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            modifierIds: current.modifierIds.includes(modifier.id)
                              ? current.modifierIds.filter((id) => id !== modifier.id)
                              : [...current.modifierIds, modifier.id],
                          }
                        : current,
                    )
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
        {save.error ? <Text>{save.error.message}</Text> : null}
        {remove.error ? <Text>{remove.error.message}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
        {draft?.id ? <Button label="Elimina" tone="danger" loading={remove.isPending} onPress={() => remove.mutate(draft.id!)} /> : null}
      </Sheet>
    </Screen>
  );
}
