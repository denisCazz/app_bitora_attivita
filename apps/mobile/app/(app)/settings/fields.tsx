import { useRouter } from "expo-router";
import { BASE_TERMINOLOGY, customFieldDefSchema, isUsable, type ModuleKey, type Terminology } from "@rapportini/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, EmptyState, Input, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { queryClient } from "../../../src/api/query";
import { Chip } from "../../../src/components/Chip";
import { QueryState } from "../../../src/components/States";
import { useManifest } from "../../../src/session";

const ENTITIES = ["CUSTOMER", "ASSET", "WORK_ORDER", "PRODUCT"] as const;
const TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "PHOTO"] as const;

type Entity = (typeof ENTITIES)[number];
type FieldType = (typeof TYPES)[number];

const ENTITY_MODULE: Record<Entity, ModuleKey> = {
  CUSTOMER: "customers",
  ASSET: "assets",
  WORK_ORDER: "work_orders",
  PRODUCT: "menu",
};

interface FieldRow {
  id: string;
  label: string;
  entity: Entity;
  type: FieldType;
  key: string;
  options?: unknown;
}

const TYPE_COPY: Record<FieldType, { label: string; hint: string }> = {
  TEXT: { label: "Testo", hint: "Una riga libera: un codice, una nota, un riferimento." },
  NUMBER: { label: "Numero", hint: "Solo cifre: una potenza, una quantità, un importo." },
  DATE: { label: "Data", hint: "Un giorno, scritto come 2026-09-25." },
  SELECT: { label: "Scelta", hint: "Chi compila ne sceglie una da un elenco." },
  PHOTO: { label: "Foto", hint: "Il link di un'immagine già caricata." },
};

function place(entity: Entity, terms: Terminology) {
  if (entity === "CUSTOMER") return `Scheda ${terms.customer.toLowerCase()}`;
  if (entity === "ASSET") return `Scheda ${terms.asset.toLowerCase()}`;
  if (entity === "WORK_ORDER") return terms.workOrder;
  return "Voce del menu";
}

function optionLabels(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function fieldKey(label: string) {
  const folded = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = /^[a-z]/.test(folded) ? folded : folded ? `campo_${folded}` : "";
  return base.slice(0, 41);
}

function uniqueKey(label: string, taken: string[]) {
  const base = fieldKey(label);
  if (base.length < 2) return null;
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const suffix = `_${n}`;
    const next = `${base.slice(0, 41 - suffix.length)}${suffix}`;
    if (!taken.includes(next)) return next;
  }
  return null;
}

export default function FieldsScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const terms = manifest.data?.tenant.terminology ?? BASE_TERMINOLOGY;
  const places = ENTITIES.filter((item) => {
    const modules = manifest.data?.modules;
    if (!modules) return true;
    return modules.some((module) => module.key === ENTITY_MODULE[item] && isUsable(module.status));
  });
  const choices = places.length ? places : [...ENTITIES];
  const [label, setLabel] = useState("");
  const [entity, setEntity] = useState<Entity>("CUSTOMER");
  const [type, setType] = useState<FieldType>("TEXT");
  const [options, setOptions] = useState("");
  const [formError, setFormError] = useState("");
  const chosen = choices.includes(entity) ? entity : choices[0]!;
  const fields = useQuery({ queryKey: ["custom-fields"], queryFn: () => http.get<FieldRow[]>("/custom-fields") });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
    await queryClient.invalidateQueries({ queryKey: ["manifest"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const key = uniqueKey(label, (fields.data ?? []).filter((field) => field.entity === chosen).map((field) => field.key));
      const parsedOptions = options.split(",").map((item) => item.trim()).filter(Boolean);
      if (!key) throw new Error("Il nome deve avere almeno due lettere.");
      if (type === "SELECT" && parsedOptions.length < 2) throw new Error("Per una scelta servono almeno due opzioni, separate da virgola.");
      return http.post("/custom-fields", customFieldDefSchema.parse({ entity: chosen, key, label, type, options: parsedOptions }));
    },
    onSuccess: async () => {
      setLabel("");
      setOptions("");
      setFormError("");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/custom-fields/${id}`),
    onSuccess: () => void refresh(),
  });
  const preview = label.trim().length >= 2 ? `Quando apri «${place(chosen, terms)}» comparirà «${label.trim()}».` : "Scrivi il nome e scegli dove deve comparire.";
  const error = formError || (save.error ? save.error.message : "");

  return (
    <Screen onBack={() => router.back()} backLabel="Impostazioni">
      <Text variant="display">Campi personalizzati</Text>
      <Text muted>
        {choices.includes("ASSET")
          ? `Sono domande in più sulle schede. Per esempio «Codice fiscale» nella scheda ${terms.customer.toLowerCase()}, o «Potenza» nella scheda ${terms.asset.toLowerCase()}. Le vedi solo nel punto che scegli qui.`
          : choices.includes("PRODUCT")
            ? "Sono domande in più sulle schede. Per esempio «Codice fiscale» sul cliente, o «Allergeni» su una voce del menu. Le vedi solo nel punto che scegli qui."
            : "Sono domande in più sulle schede. Dai un nome, scegli dove compaiono e che risposta ti aspetti. Le vedi solo lì."}
      </Text>
      <QueryState isLoading={fields.isLoading} error={fields.error} refetch={() => fields.refetch()}>
        {fields.data?.length ? (
          ENTITIES.map((item) => {
            const rows = fields.data?.filter((field) => field.entity === item) ?? [];
            if (!rows.length) return null;
            return (
              <View key={item} style={{ gap: 10 }}>
                <Text variant="title">{place(item, terms)}</Text>
                {rows.map((field) => (
                  <Card key={field.id} style={{ gap: 8 }}>
                    <Text variant="heading">{field.label}</Text>
                    <Text muted>
                      {TYPE_COPY[field.type].label}
                      {field.type === "SELECT" && optionLabels(field.options).length ? ` · ${optionLabels(field.options).join(", ")}` : ""}
                    </Text>
                    <Button label="Togli questo campo" tone="danger" onPress={() => remove.mutate(field.id)} />
                  </Card>
                ))}
              </View>
            );
          })
        ) : (
          <EmptyState title="Nessuna domanda extra" message="Aggiungine una qui sotto. Comparirà nella scheda che indichi." />
        )}
      </QueryState>
      <Card style={{ gap: 12 }}>
        <Text variant="heading">Nuova domanda</Text>
        <Input label="Come si chiama" value={label} onChangeText={setLabel} placeholder="Codice fiscale" />
        <Text variant="label">Dove compare</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {choices.map((item) => (
            <Chip key={item} label={place(item, terms)} active={chosen === item} onPress={() => setEntity(item)} />
          ))}
        </View>
        <Text variant="label">Che risposta aspetti</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TYPES.map((item) => (
            <Chip key={item} label={TYPE_COPY[item].label} active={type === item} onPress={() => setType(item)} />
          ))}
        </View>
        <Text muted>{TYPE_COPY[type].hint}</Text>
        {type === "SELECT" ? <Input label="Opzioni, separate da virgola" value={options} onChangeText={setOptions} placeholder="Privato, Azienda" /> : null}
        <Text muted>{preview}</Text>
        {error ? <Text>{error}</Text> : null}
        <Button
          label="Aggiungi"
          loading={save.isPending}
          onPress={() => {
            setFormError("");
            save.mutate();
          }}
        />
      </Card>
    </Screen>
  );
}
