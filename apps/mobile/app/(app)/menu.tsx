import { groupMenu, menuItemSchema, menuKey, modifierSchema } from "@rapportini/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ScrollView, Switch, View } from "react-native";
import { Badge, Button, Card, EmptyState, Fab, Input, Pressy, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { setAiConsent, useAiConsent } from "../../src/account";
import { ApiError, api, http } from "../../src/api/client";
import { queryClient } from "../../src/api/query";
import { Chip } from "../../src/components/Chip";
import { QueryState } from "../../src/components/States";
import { euro, stationPhrase, towardStation } from "../../src/format";
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

interface PreviewItem {
  name: string;
  category: string;
  price: number;
  station: string;
  available: boolean;
  modifiers: Array<{ name: string; priceDelta: number }>;
  change: "new" | "update" | "same";
}

interface Preview {
  url: string;
  summary: string;
  items: PreviewItem[];
  missing: Array<{ id: string; name: string; category: string }>;
}

const blank = (): Draft => ({ name: "", category: "", price: "", station: "", available: true, modifierIds: [] });

function priceText(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function hostLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function itemMeta(item: Item, stations: Array<{ key: string; label: string }>) {
  const where = stations.length > 1 ? towardStation(vocabLabel(stations, item.station)) : "";
  const variants = item.modifiers.length === 1 ? "1 variante" : item.modifiers.length > 1 ? `${item.modifiers.length} varianti` : "";
  return [where ? `Va ${where}` : "", variants, item.available ? "" : "Non disponibile"].filter(Boolean).join(" · ");
}

export default function MenuScreen() {
  const theme = useTheme();
  const manifest = useManifest();
  const writable = can(manifest.data, "menu.write");
  const readable = can(manifest.data, "menu.read");
  const { stations } = useVocab();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [site, setSite] = useState({ open: false, auto: false });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const query = useQuery({ queryKey: ["menu"], queryFn: () => http.get<Item[]>("/menu-items"), enabled: readable });
  const source = useQuery({ queryKey: ["menu-source"], queryFn: () => http.get<{ url: string | null }>("/menu-source"), enabled: writable });
  const modifiers = useQuery({
    queryKey: ["modifiers"],
    queryFn: () => http.get<Modifier[]>("/modifiers"),
    enabled: readable && (Boolean(draft) || variantsOpen),
  });
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
  const removeModifier = useMutation({
    mutationFn: (id: string) => http.del(`/modifiers/${id}`),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["modifiers"] }), queryClient.invalidateQueries({ queryKey: ["menu"] })]);
    },
  });

  const searched = useMemo(() => {
    const needle = menuKey(search);
    return (query.data ?? []).filter((item) => !needle || menuKey(`${item.name} ${item.category}`).includes(needle));
  }, [query.data, search]);
  const chips = useMemo(() => groupMenu(searched).map((group) => ({ category: group.category, count: group.items.length })), [searched]);
  const groups = useMemo(() => {
    const rows = category ? searched.filter((item) => menuKey(item.category || "Altro") === menuKey(category)) : searched;
    return groupMenu(rows);
  }, [searched, category]);

  useEffect(() => {
    if (category && !chips.some((chip) => menuKey(chip.category) === menuKey(category))) setCategory("");
  }, [chips, category]);

  function openCreate() {
    save.reset();
    remove.reset();
    setDraft({ ...blank(), station: stations[0]?.key ?? "" });
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

  const where = stationPhrase(stations.map((station) => station.label));
  const total = query.data?.length ?? 0;
  const categoryCount = new Set((query.data ?? []).map((item) => menuKey(item.category || "Altro"))).size;

  if (manifest.data && !readable) {
    return (
      <Screen>
        <Text variant="display">Menu</Text>
        <EmptyState title="Non è il tuo menu" message="Piatti e prezzi li gestisce chi ha il permesso. Tu qui non li vedi." />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => Promise.all([query.refetch(), writable ? source.refetch() : Promise.resolve()])}>
      <Text variant="display">Menu</Text>
      <Text muted>
        {total
          ? `${total} ${total === 1 ? "voce" : "voci"} in ${categoryCount} ${categoryCount === 1 ? "categoria" : "categorie"}.`
          : "Piatti e bevande, divisi per categoria."}{" "}
        {where ? `Quando invii la comanda, ogni voce parte ${where}.` : "Sono le voci che si scelgono in comanda."}
      </Text>
      {writable ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Varianti" tone="secondary" style={{ flex: 1 }} onPress={() => setVariantsOpen(true)} />
          <Button
            label={source.data?.url ? "Aggiorna" : "Dal sito"}
            tone="secondary"
            style={{ flex: 1 }}
            onPress={() => setSite({ open: true, auto: Boolean(source.data?.url) })}
          />
        </View>
      ) : null}
      {writable && source.data?.url ? <Text variant="caption" muted>{`Sito collegato: ${hostLabel(source.data.url)}`}</Text> : null}
      <QueryState isLoading={query.isLoading || manifest.isLoading} error={query.error} refetch={() => query.refetch()}>
        {total ? (
          <>
            <Input label="Cerca" value={search} onChangeText={setSearch} placeholder="Nome o categoria" autoCorrect={false} />
            {chips.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip label="Tutte" active={!category} onPress={() => setCategory("")} />
                {chips.map((chip) => (
                  <Chip
                    key={chip.category}
                    label={`${chip.category} ${chip.count}`}
                    active={menuKey(category) === menuKey(chip.category)}
                    onPress={() => setCategory(chip.category)}
                  />
                ))}
              </ScrollView>
            ) : null}
            {groups.length ? (
              groups.map((group) => (
                <View key={group.category} style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                    <Text variant="title">{group.category}</Text>
                    <Text variant="caption" muted>
                      {group.items.length}
                    </Text>
                  </View>
                  <Card style={{ paddingVertical: 4 }}>
                    {group.items.map((item, index) => {
                      const meta = itemMeta(item, stations);
                      return (
                        <Pressy
                          key={item.id}
                          accessibilityRole={writable ? "button" : "text"}
                          accessibilityLabel={meta ? `${item.name}. ${meta}` : item.name}
                          disabled={!writable}
                          onPress={writable ? () => openEdit(item) : undefined}
                          style={{
                            gap: 2,
                            paddingVertical: 12,
                            paddingHorizontal: 4,
                            borderTopWidth: index ? 1 : 0,
                            borderTopColor: theme.colors.line,
                            opacity: item.available ? 1 : 0.55,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                            <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                              {item.name}
                            </Text>
                            <Text style={{ fontVariant: ["tabular-nums"] }}>{euro(item.price)}</Text>
                          </View>
                          {meta ? (
                            <Text variant="caption" muted>
                              {meta}
                            </Text>
                          ) : null}
                        </Pressy>
                      );
                    })}
                  </Card>
                </View>
              ))
            ) : (
              <Text muted>Nessuna voce con questo nome.</Text>
            )}
          </>
        ) : (
          <EmptyState
            title="Menu vuoto"
            message={writable ? "Aggiungi una voce con +, oppure leggila dal sito del locale." : "Non c'è ancora nessuna voce."}
          />
        )}
      </QueryState>
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
        {stations.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Text variant="label">Dove la mandi</Text>
            <Text muted>Quando invii la comanda, questa voce arriva qui.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {stations.map(({ key, label }) => (
                <Chip key={key} label={label} active={draft?.station === key} onPress={() => setDraft((current) => (current ? { ...current, station: key } : current))} />
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
        {save.error ? <Text style={{ color: theme.colors.danger }}>{save.error.message}</Text> : null}
        {remove.error ? <Text style={{ color: theme.colors.danger }}>{remove.error.message}</Text> : null}
        <Button label="Salva" loading={save.isPending} onPress={() => save.mutate()} />
        {draft?.id ? <Button label="Elimina" tone="danger" loading={remove.isPending} onPress={() => remove.mutate(draft.id!)} /> : null}
      </Sheet>
      <Sheet visible={variantsOpen} title="Varianti" onClose={() => setVariantsOpen(false)}>
        <Text muted>Aggiunte che si scelgono in comanda, per esempio «senza ghiaccio». Il prezzo è un sovrapprezzo e vale per tutte le voci a cui la colleghi.</Text>
        {modifiers.data?.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {modifiers.data.map((modifier, index) => (
              <View
                key={modifier.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: theme.colors.line,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading">{modifier.name}</Text>
                  <Text variant="caption" muted>
                    {Number(modifier.priceDelta) ? euro(modifier.priceDelta) : "Nessun sovrapprezzo"}
                  </Text>
                </View>
                <Pressy accessibilityRole="button" accessibilityLabel={`Elimina ${modifier.name}`} onPress={() => removeModifier.mutate(modifier.id)}>
                  <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Elimina</Text>
                </Pressy>
              </View>
            ))}
          </Card>
        ) : (
          <Text muted>Nessuna variante ancora.</Text>
        )}
        {removeModifier.error ? <Text style={{ color: theme.colors.danger }}>{removeModifier.error.message}</Text> : null}
        <Controller control={modifierForm.control} name="name" render={({ field }) => <Input label="Nome" value={field.value} onChangeText={field.onChange} />} />
        <Controller
          control={modifierForm.control}
          name="priceDelta"
          render={({ field }) => (
            <Input
              label="Variazione prezzo"
              keyboardType="decimal-pad"
              value={field.value ? String(field.value) : ""}
              onChangeText={(text) => field.onChange(Number(text.replace(",", ".")) || 0)}
            />
          )}
        />
        {addModifier.error ? <Text style={{ color: theme.colors.danger }}>{addModifier.error.message}</Text> : null}
        <Button label="Aggiungi variante" tone="secondary" loading={addModifier.isPending} onPress={modifierForm.handleSubmit((values) => addModifier.mutate(values))} />
      </Sheet>
      <SiteSheet
        visible={site.open}
        auto={site.auto}
        initialUrl={source.data?.url ?? ""}
        stations={stations}
        onClose={() => setSite({ open: false, auto: false })}
        onApplied={async () => {
          setSite({ open: false, auto: false });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["menu"] }),
            queryClient.invalidateQueries({ queryKey: ["modifiers"] }),
            queryClient.invalidateQueries({ queryKey: ["menu-source"] }),
          ]);
        }}
      />
    </Screen>
  );
}

function SiteSheet({
  visible,
  auto,
  initialUrl,
  stations,
  onClose,
  onApplied,
}: {
  visible: boolean;
  auto: boolean;
  initialUrl: string;
  stations: Array<{ key: string; label: string }>;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const theme = useTheme();
  const consent = useAiConsent();
  const [url, setUrl] = useState(initialUrl);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hideMissing, setHideMissing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const started = useRef(false);
  const read = useMutation({
    mutationFn: (next: string) => api<Preview>("POST", "/menu-import", { url: next }, { force: true }),
    onSuccess: (data) => {
      setPreview(data);
      setHideMissing(false);
    },
  });
  const apply = useMutation({
    mutationFn: (input: { current: Preview; hideMissing: boolean }) =>
      api(
        "POST",
        "/menu-import/apply",
        {
          url: input.current.url,
          hideMissing: input.hideMissing,
          items: input.current.items.map(({ name, category, price, station, available, modifiers }) => ({ name, category, price, station, available, modifiers })),
        },
        { force: true },
      ),
    onSuccess: () => onApplied(),
  });

  const resetRead = read.reset;
  const resetApply = apply.reset;
  const readSite = read.mutate;

  useEffect(() => {
    if (!visible) {
      started.current = false;
      setPreview(null);
      setHideMissing(false);
      resetRead();
      resetApply();
      return;
    }
    setUrl(initialUrl);
  }, [visible, initialUrl, resetRead, resetApply]);

  useEffect(() => {
    if (!visible || !auto || !consent.granted || !initialUrl || started.current) return;
    started.current = true;
    readSite(initialUrl);
  }, [visible, auto, consent.granted, initialUrl, readSite]);

  const changed = preview?.items.filter((item) => item.change !== "same") ?? [];
  const same = (preview?.items.length ?? 0) - changed.length;
  const groups = groupMenu(changed);
  const needsConsent = !consent.granted || (read.error instanceof ApiError && read.error.status === 428);
  const canApply = Boolean(preview && (changed.length > 0 || (hideMissing && preview.missing.length > 0)));

  async function accept() {
    setAccepting(true);
    try {
      await setAiConsent(true);
      read.reset();
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Sheet visible={visible} title="Menu dal sito" onClose={onClose}>
      <Text muted>Metti l’indirizzo della pagina. L’assistente la legge e ti propone categorie, prezzi e varianti. Niente viene salvato finché non confermi.</Text>
      {needsConsent ? (
        <Card style={{ gap: 8 }}>
          <Text variant="heading">Serve il consenso all’assistente</Text>
          <Text muted>Il testo della pagina viene inviato a OpenAI per ricavare il menu. Puoi revocarlo da Profilo.</Text>
          <Button label="Accetto e continuo" loading={accepting || consent.loading} onPress={() => void accept()} />
        </Card>
      ) : (
        <>
          <Input
            label="Sito"
            value={url}
            onChangeText={(next) => {
              setUrl(next);
              setPreview(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://"
          />
          <Button label={preview ? "Leggi di nuovo" : "Leggi il sito"} tone="secondary" loading={read.isPending} onPress={() => read.mutate(url.trim())} />
        </>
      )}
      {read.error && !(read.error instanceof ApiError && read.error.status === 428) ? (
        <Text style={{ color: theme.colors.danger }}>{read.error.message}</Text>
      ) : null}
      {preview ? (
        <>
          <Text>{preview.summary}</Text>
          {groups.map((group) => (
            <View key={group.category} style={{ gap: 8 }}>
              <Text variant="title">{group.category}</Text>
              <Card style={{ paddingVertical: 4 }}>
                {group.items.map((item, index) => (
                  <View
                    key={`${item.name}-${index}`}
                    style={{
                      gap: 4,
                      paddingVertical: 12,
                      paddingHorizontal: 4,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: theme.colors.line,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                        {item.name}
                      </Text>
                      <Badge tone={item.change === "new" ? "accent" : "warning"} label={item.change === "new" ? "Nuova" : "Aggiornata"} />
                    </View>
                    <Text variant="caption" muted>
                      {[euro(item.price), stations.length > 1 ? vocabLabel(stations, item.station) : "", item.modifiers.length ? item.modifiers.map((modifier) => modifier.name).join(", ") : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>
          ))}
          {same ? <Text muted>{same === 1 ? "1 voce è già uguale e resta com’è." : `${same} voci sono già uguali e restano com’erano.`}</Text> : null}
          {preview.missing.length ? (
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading">Voci che sul sito non ci sono</Text>
                  <Text variant="caption" muted>
                    {preview.missing.map((item) => item.name).join(", ")}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Segna non disponibili le voci assenti dal sito"
                  value={hideMissing}
                  onValueChange={setHideMissing}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
                  thumbColor="#fff"
                />
              </View>
              <Text variant="caption" muted>
                Acceso: le segni non disponibili. Spento: restano nel menu.
              </Text>
            </Card>
          ) : null}
          {!changed.length && !preview.missing.length ? <Text muted>Il menu è già allineato al sito.</Text> : null}
          {apply.error ? <Text style={{ color: theme.colors.danger }}>{apply.error.message}</Text> : null}
          {canApply ? <Button label="Imposta il menu" loading={apply.isPending} onPress={() => apply.mutate({ current: preview, hideMissing })} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}
