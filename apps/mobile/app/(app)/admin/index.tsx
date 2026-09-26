import { Ionicons } from "@expo/vector-icons";
import { categorySchema } from "@rapportini/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Input, ListItem, Screen, Sheet, Text, useTheme } from "@rapportini/ui";
import { childrenOf, useAdminCatalog, useAdminMutation, useAdminUsers, type AdminCategory } from "../../../src/admin";
import { http } from "../../../src/api/client";
import { signOut } from "../../../src/account";
import { QueryState } from "../../../src/components/States";
import { useManifest } from "../../../src/session";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export default function ConsoleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const catalog = useAdminCatalog();
  const users = useAdminUsers();
  const manifest = useManifest();
  const [creating, setCreating] = useState<{ parent: AdminCategory | null } | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const categories = catalog.data?.categories ?? [];

  const create = useAdminMutation((input: { label: string; parent: AdminCategory | null }) =>
    http.post<{ id: string }>("/admin/categories", categorySchema.parse({ label: input.label, key: slugify(input.label), parentId: input.parent?.id ?? null })),
  );

  async function submit() {
    if (!creating) return;
    setError(null);
    try {
      const created = (await create.mutateAsync({ label: label.trim(), parent: creating.parent })) as { id: string };
      setCreating(null);
      setLabel("");
      router.push(`/(app)/admin/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossibile creare la categoria");
    }
  }

  const row = (category: AdminCategory, nested: boolean) => (
    <ListItem
      key={category.id}
      title={category.label}
      subtitle={`${category.tenantCount} negozi${category.active ? "" : " · disattivata"}`}
      leading={
        nested ? (
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: category.accent ?? theme.colors.inkSoft }} />
        ) : (
          <Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={20} color={category.accent ?? theme.colors.accent} />
        )
      }
      onPress={() => router.push(`/(app)/admin/${category.id}`)}
    />
  );

  async function leave() {
    if (manifest.data) {
      router.back();
      return;
    }
    await signOut();
    router.replace("/(auth)/login");
  }

  return (
    <Screen onBack={() => void leave()} backLabel={manifest.data ? "Altro" : "Esci"}>
      <View style={{ gap: 6 }}>
        <Badge tone="accent" label="Team Bitora" />
        <Text variant="display">Console</Text>
        <Text muted>Utenti e personalizzazioni di ogni negozio. Categorie, moduli e prezzi arrivano nelle app dei clienti in pochi secondi.</Text>
      </View>

      <Card style={{ paddingVertical: 4 }}>
        <ListItem
          title="Utenti"
          subtitle={users.data ? `${users.data.length} account` : "Account, negozi e personalizzazioni"}
          leading={<Ionicons name="people-outline" size={20} color={theme.colors.accent} />}
          onPress={() => router.push("/(app)/admin/users")}
        />
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <ListItem
          title="Moduli e prezzi"
          subtitle={`${catalog.data?.modules.length ?? "…"} moduli nel catalogo`}
          leading={<Ionicons name="pricetags-outline" size={20} color={theme.colors.accent} />}
          onPress={() => router.push("/(app)/admin/modules")}
        />
      </Card>

      <QueryState isLoading={catalog.isLoading} error={catalog.error} refetch={() => void catalog.refetch()}>
        {childrenOf(categories, null).map((root) => (
          <View key={root.id} style={{ gap: 8 }}>
            <Card style={{ paddingVertical: 4 }}>
              {row(root, false)}
              {childrenOf(categories, root.id).map((child) => (
                <View key={child.id} style={{ paddingLeft: 18 }}>
                  {row(child, true)}
                </View>
              ))}
            </Card>
            <Button tone="ghost" label={`+ Sottocategoria di ${root.label}`} onPress={() => setCreating({ parent: root })} />
          </View>
        ))}
        <Button tone="secondary" label="+ Nuova categoria principale" onPress={() => setCreating({ parent: null })} />
      </QueryState>

      <Sheet visible={Boolean(creating)} title={creating?.parent ? `Nuova sottocategoria di ${creating.parent.label}` : "Nuova categoria"} onClose={() => setCreating(null)}>
        <Input label="Nome" value={label} onChangeText={setLabel} placeholder={creating?.parent ? "Es. Pompe di calore" : "Es. Pulizie"} autoFocus />
        {creating && !creating.parent ? (
          <Text variant="caption" muted>
            Un nuovo settore: poi scegli quali moduli sono gratis e quali consigliati, le parole, i ruoli e le esigenze da proporre.
          </Text>
        ) : (
          <Text variant="caption" muted>
            Eredita moduli, ruoli, termini e colori dalla categoria padre: poi cambi solo quello che serve.
          </Text>
        )}
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        <Button label="Crea" loading={create.isPending} disabled={label.trim().length < 2} onPress={() => void submit()} />
      </Sheet>
    </Screen>
  );
}
