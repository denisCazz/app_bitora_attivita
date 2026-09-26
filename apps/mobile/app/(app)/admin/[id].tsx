import { TERMINOLOGY_KEYS, type CategoryPresets, type CategoryRoleRow, type Terminology } from "@rapportini/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { Badge, Button, Card, Input, Pressy, Screen, Text, useTheme } from "@rapportini/ui";
import { euros, useAdminCatalog, useAdminMutation, useCategoryPreview, type AdminCategory } from "../../../src/admin";
import { http } from "../../../src/api/client";
import { Chip } from "../../../src/components/Chip";
import { PermissionToggles } from "../../../src/components/PermissionToggles";
import { QueryState } from "../../../src/components/States";

const TERM_LABEL: Record<keyof Terminology, string> = {
  workOrder: "Intervento (singolare)",
  workOrders: "Interventi (plurale)",
  asset: "Impianto (singolare)",
  assets: "Impianti (plurale)",
  customer: "Cliente (singolare)",
  customers: "Clienti (plurale)",
  sparePart: "Ricambio (singolare)",
  spareParts: "Ricambi (plurale)",
  warehouse: "Magazzino",
  vehicle: "Mezzo (furgone, auto…)",
};

const SWATCHES = ["#2F6FED", "#E25B2A", "#D9480F", "#0EA5E9", "#1C6B56", "#B4431E", "#7C3AED", "#DB2777", "#0F766E", "#CA8A04"];

function asRecord<T>(value: unknown): Partial<T> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<T>) : {};
}

function useErrors() {
  const [error, setError] = useState<string | null>(null);
  async function run(task: () => Promise<unknown>) {
    setError(null);
    try {
      await task();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operazione non riuscita");
      return false;
    }
  }
  return { error, run };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text variant="title">{title}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

function GeneralSection({ category }: { category: AdminCategory }) {
  const theme = useTheme();
  const [label, setLabel] = useState(category.label);
  const [description, setDescription] = useState(category.description);
  const [icon, setIcon] = useState(category.icon);
  const [accent, setAccent] = useState(category.accent ?? "");
  const [image, setImage] = useState(category.image ?? "");
  const save = useAdminMutation((body: Record<string, unknown>) => http.patch(`/admin/categories/${category.id}`, body));
  const { error, run } = useErrors();

  return (
    <Section title="Generale">
      <Input label="Nome" value={label} onChangeText={setLabel} />
      <Input label="Descrizione" value={description} onChangeText={setDescription} multiline />
      <Input label="Icona (nome Ionicons)" value={icon} onChangeText={setIcon} autoCapitalize="none" />
      <View style={{ gap: 8 }}>
        <Text variant="caption" muted>
          Colore {category.parentId ? "(vuoto = eredita)" : ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {SWATCHES.map((swatch) => (
            <Pressy
              key={swatch}
              accessibilityLabel={`Colore ${swatch}`}
              onPress={() => setAccent(accent === swatch ? "" : swatch)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: swatch, borderWidth: accent === swatch ? 3 : 0, borderColor: theme.colors.ink }}
            />
          ))}
        </View>
        <Input label="Colore HEX" value={accent} onChangeText={setAccent} autoCapitalize="none" placeholder="Eredita" />
      </View>
      <Input label="Immagine (asset:stove, asset:boiler, asset:hvac, asset:bar o URL)" value={image} onChangeText={setImage} autoCapitalize="none" placeholder="Eredita" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">Visibile nella registrazione</Text>
          <Text variant="caption" muted>
            I negozi già attivi continuano a funzionare.
          </Text>
        </View>
        <Switch
          value={category.active}
          onValueChange={(active) => void run(() => save.mutateAsync({ active }))}
          trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
          thumbColor="#fff"
        />
      </View>
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button
        label="Salva"
        loading={save.isPending}
        onPress={() =>
          void run(() =>
            save.mutateAsync({ label: label.trim(), description: description.trim(), icon: icon.trim(), accent: accent.trim() || null, image: image.trim() || null }),
          )
        }
      />
    </Section>
  );
}

function TerminologySection({ category, inherited }: { category: AdminCategory; inherited: Terminology }) {
  const theme = useTheme();
  const own = asRecord<Terminology>(category.terminology);
  const [values, setValues] = useState<Partial<Terminology>>(own);
  const save = useAdminMutation((body: Partial<Terminology>) => http.patch(`/admin/categories/${category.id}`, { terminology: body }));
  const { error, run } = useErrors();

  return (
    <Section title="Parole dell'app" hint="Vuoto = usa quella della categoria padre (in grigio).">
      {TERMINOLOGY_KEYS.map((key) => (
        <Input key={key} label={TERM_LABEL[key]} value={values[key] ?? ""} placeholder={inherited[key]} onChangeText={(text) => setValues((current) => ({ ...current, [key]: text }))} />
      ))}
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button
        label="Salva parole"
        loading={save.isPending}
        onPress={() =>
          void run(() => save.mutateAsync(Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "string" && value.trim().length >= 2))))
        }
      />
    </Section>
  );
}

function ModuleRow({
  categoryId,
  parentId,
  definition,
  own,
  effective,
}: {
  categoryId: string;
  parentId: string | null;
  definition: { key: string; label: string; description: string; priceCents: number };
  own: { included: boolean; recommended: boolean | null; free: boolean | null; tab: boolean | null; label: string | null; description: string | null } | undefined;
  effective: { label: string; description: string; free: boolean; recommended: boolean; tab: boolean; priceCents: number } | undefined;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState(own?.label ?? "");
  const [description, setDescription] = useState(own?.description ?? "");
  const upsert = useAdminMutation((body: Record<string, unknown>) => http.put(`/admin/categories/${categoryId}/modules`, body));
  const reset = useAdminMutation((key: string) => http.del(`/admin/categories/${categoryId}/modules/${key}`));
  const { error, run } = useErrors();
  const base = {
    moduleKey: definition.key,
    included: own?.included ?? true,
    recommended: own?.recommended ?? null,
    free: own?.free ?? null,
    tab: own?.tab ?? null,
    label: own?.label ?? null,
    description: own?.description ?? null,
  };

  return (
    <View style={{ gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.line }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {effective?.label ?? definition.label}
        </Text>
        {effective ? <Badge tone={effective.free ? "success" : "accent"} label={effective.free ? "Gratis" : `€ ${euros(effective.priceCents)}`} /> : <Badge label="Nascosto" />}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label="Nascosto" tone={theme.colors.danger} active={!effective} onPress={() => void run(() => upsert.mutateAsync({ ...base, included: !effective }))} />
        {effective ? (
          <>
            <Chip label="Consigliato" active={effective.recommended} onPress={() => void run(() => upsert.mutateAsync({ ...base, included: true, recommended: !effective.recommended }))} />
            <Chip label="Gratis" tone={theme.colors.success} active={effective.free} onPress={() => void run(() => upsert.mutateAsync({ ...base, included: true, free: !effective.free }))} />
            <Chip label="Nel menu" active={effective.tab} onPress={() => void run(() => upsert.mutateAsync({ ...base, included: true, tab: !effective.tab }))} />
          </>
        ) : null}
        {own && parentId ? <Chip label="↺ Eredita" active={false} onPress={() => void run(() => reset.mutateAsync(definition.key))} /> : null}
      </View>
      <Input label="Nome" value={label} onChangeText={setLabel} placeholder={effective?.label ?? definition.label} />
      <Input label="Testo" value={description} onChangeText={setDescription} placeholder={effective?.description || definition.description || "Scrivi una descrizione"} multiline />
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button
        tone="secondary"
        label="Salva testo"
        loading={upsert.isPending}
        onPress={() => void run(() => upsert.mutateAsync({ ...base, included: Boolean(effective), label: label.trim() || null, description: description.trim() || null }))}
      />
    </View>
  );
}

function ModulesSection({ category, preview }: { category: AdminCategory; preview: NonNullable<ReturnType<typeof useCategoryPreview>["data"]> }) {
  const catalog = useAdminCatalog();

  return (
    <Section
      title="Moduli"
      hint="La categoria vende solo i moduli elencati qui o nella categoria padre: gli altri restano nascosti. Qui decidi cosa è gratis, cosa proponiamo per primo (consigliato), cosa sta nel menu e cosa nascondere. Nome e testo vuoti usano il modello del catalogo."
    >
      {catalog.data?.modules.map((definition) => {
        const own = category.modules.find((row) => row.moduleKey === definition.key);
        const effective = preview.modules.find((module) => module.key === definition.key);
        return (
          <ModuleRow
            key={`${definition.key}:${own?.label ?? ""}:${own?.description ?? ""}`}
            categoryId={category.id}
            parentId={category.parentId}
            definition={definition}
            own={own}
            effective={effective}
          />
        );
      })}
    </Section>
  );
}

function NeedsSection({ category, inherited }: { category: AdminCategory; inherited: string[] }) {
  const theme = useTheme();
  const catalog = useAdminCatalog();
  const own = (catalog.data?.needs ?? []).filter((need) => need.categoryId === category.id);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const create = useAdminMutation((body: Record<string, unknown>) => http.post("/admin/needs", body));
  const remove = useAdminMutation((id: string) => http.del(`/admin/needs/${id}`));
  const { error, run } = useErrors();
  const key = `${category.key}_${label}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  return (
    <Section title="Esigenze" hint="Le domande dell'onboarding: ogni esigenza scelta mette in cima i suoi moduli. Valgono anche per le sottocategorie.">
      {inherited.length ? (
        <Text variant="caption" muted>
          Già proposte: {inherited.join(", ")}
        </Text>
      ) : null}
      {own.map((need) => (
        <View key={need.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.line }}>
          <Text variant="heading">{need.label}</Text>
          <Text variant="caption" muted>
            {need.modules.map((moduleKey) => catalog.data?.modules.find((module) => module.key === moduleKey)?.label ?? moduleKey).join(", ")}
          </Text>
          <Button tone="ghost" label="Rimuovi" onPress={() => void run(() => remove.mutateAsync(need.id))} />
        </View>
      ))}
      <Input label="Nuova esigenza" value={label} onChangeText={setLabel} placeholder="Es. Gestire gli abbonamenti" />
      <Input label="Spiegazione" value={description} onChangeText={setDescription} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {catalog.data?.modules.map((module) => (
          <Chip
            key={module.key}
            label={module.label}
            active={modules.includes(module.key)}
            onPress={() => setModules((current) => (current.includes(module.key) ? current.filter((item) => item !== module.key) : [...current, module.key]))}
          />
        ))}
      </View>
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button
        label="Aggiungi esigenza"
        loading={create.isPending}
        disabled={label.trim().length < 2 || !modules.length}
        onPress={() =>
          void run(() =>
            create.mutateAsync({ key, categoryId: category.id, label: label.trim(), description: description.trim(), modules, sortOrder: own.length }).then(() => {
              setLabel("");
              setDescription("");
              setModules([]);
            }),
          )
        }
      />
    </Section>
  );
}

function AssetTypesSection({ category, inherited }: { category: AdminCategory; inherited: string[] }) {
  const theme = useTheme();
  const own = asRecord<CategoryPresets>(category.presets);
  const [text, setText] = useState((own.assetTypes ?? []).join("\n"));
  const save = useAdminMutation((presets: CategoryPresets) => http.patch(`/admin/categories/${category.id}`, { presets }));
  const { error, run } = useErrors();
  const types = text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <Section title="Tipi di impianto" hint="Uno per riga. Vuoto = eredita dalla categoria padre.">
      <Input label="Tipi" value={text} onChangeText={setText} multiline placeholder={inherited.join("\n")} style={{ minHeight: 120, textAlignVertical: "top", paddingTop: 14 }} />
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button label="Salva tipi" loading={save.isPending} onPress={() => void run(() => save.mutateAsync({ ...own, assetTypes: types }))} />
    </Section>
  );
}

function RolesSection({
  category,
  inherited,
  catalog,
}: {
  category: AdminCategory;
  inherited: CategoryRoleRow[];
  catalog: Array<{ key: string; label: string }>;
}) {
  const theme = useTheme();
  const [roles, setRoles] = useState<CategoryRoleRow[]>(category.roles);
  useEffect(() => setRoles(category.roles), [category.roles]);
  const save = useAdminMutation((body: CategoryRoleRow[]) => http.put(`/admin/categories/${category.id}/roles`, body));
  const { error, run } = useErrors();
  const customised = category.roles.length > 0 || roles.length > 0;

  function update(index: number, patch: Partial<CategoryRoleRow>) {
    setRoles((current) => current.map((role, position) => (position === index ? { ...role, ...patch } : role)));
  }

  if (!customised) {
    return (
      <Section title="Ruoli" hint="Ruoli creati per ogni nuovo negozio di questa categoria.">
        <Text muted>Ereditati: {inherited.map((role) => role.name).join(", ") || "solo Titolare"}</Text>
        <Button tone="secondary" label="Personalizza qui" onPress={() => setRoles(inherited.map((role) => ({ ...role })))} />
      </Section>
    );
  }

  return (
    <Section title="Ruoli" hint="Valgono per i nuovi negozi. Acceso = può farlo. Serve almeno un ruolo titolare.">
      {roles.map((role, index) => (
        <View key={index} style={{ gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.line }}>
          <Input label="Nome ruolo" value={role.name} onChangeText={(name) => update(index, { name })} />
          <Chip label="Titolare" tone={theme.colors.warning} active={role.owner} onPress={() => update(index, { owner: !role.owner })} />
          <PermissionToggles
            selected={role.permissions}
            catalog={catalog}
            onToggle={(permission) =>
              update(index, {
                permissions: role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission],
              })
            }
          />
          <Button tone="ghost" label="Rimuovi ruolo" onPress={() => setRoles((current) => current.filter((_, position) => position !== index))} />
        </View>
      ))}
      <Button tone="secondary" label="+ Aggiungi ruolo" onPress={() => setRoles((current) => [...current, { name: "", owner: false, permissions: ["dashboard.view"], sortOrder: current.length }])} />
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Button
        label="Salva ruoli"
        loading={save.isPending}
        onPress={() => void run(() => save.mutateAsync(roles.map((role, index) => ({ name: role.name.trim(), owner: role.owner, permissions: role.permissions, sortOrder: index }))))}
      />
      {category.parentId ? <Button tone="ghost" label="↺ Torna a ereditare" onPress={() => void run(() => save.mutateAsync([]).then(() => setRoles([])))} /> : null}
    </Section>
  );
}

export default function CategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const catalog = useAdminCatalog();
  const preview = useCategoryPreview(id);
  const category = catalog.data?.categories.find((item) => item.id === id);
  const parent = catalog.data?.categories.find((item) => item.id === category?.parentId);
  const parentPreview = useCategoryPreview(parent?.id ?? id);
  const inherited = parent ? parentPreview.data : undefined;
  const hasChildren = catalog.data?.categories.some((item) => item.parentId === id) ?? false;
  const remove = useAdminMutation(() => http.del(`/admin/categories/${id}`));
  const { error, run } = useErrors();

  return (
    <Screen onBack={() => router.back()} backLabel="Console">
      <Stack.Screen options={{ title: category?.label ?? "Categoria" }} />
      <QueryState isLoading={catalog.isLoading || preview.isLoading} error={catalog.error ?? preview.error} refetch={() => void catalog.refetch()}>
        {category && preview.data ? (
          <>
            <View style={{ gap: 6 }}>
              <Text variant="caption" muted>
                {preview.data.path.map((node) => node.label).join(" › ")}
              </Text>
              <Text variant="display">{category.label}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Badge label={`${category.tenantCount} negozi`} />
                <Badge tone="accent" label={`${preview.data.modules.filter((module) => module.free).length} moduli gratis`} />
              </View>
            </View>
            <GeneralSection key={`g:${category.id}:${category.label}:${category.accent}`} category={category} />
            <ModulesSection category={category} preview={preview.data} />
            <NeedsSection
              category={category}
              inherited={preview.data.needs.filter((need) => !catalog.data?.needs.some((row) => row.key === need.key && row.categoryId === category.id)).map((need) => need.label)}
            />
            <TerminologySection key={`t:${category.id}`} category={category} inherited={inherited?.terminology ?? preview.data.terminology} />
            <AssetTypesSection key={`a:${category.id}`} category={category} inherited={inherited?.presets.assetTypes ?? []} />
            <RolesSection
              category={category}
              inherited={inherited?.roles ?? preview.data.roles}
              catalog={preview.data.modules.map((module) => ({ key: module.key, label: module.label }))}
            />
            {category.tenantCount === 0 && !hasChildren ? (
              <Button tone="danger" label="Elimina categoria" onPress={() => void run(() => remove.mutateAsync(undefined)).then((ok) => ok && router.back())} />
            ) : (
              <Text variant="caption" muted style={{ textAlign: "center" }}>
                Categoria in uso: per nasconderla spegni "Visibile nella registrazione".
              </Text>
            )}
            {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}
