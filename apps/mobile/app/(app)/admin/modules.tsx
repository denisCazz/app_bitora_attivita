import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ModuleDefRow } from "@rapportini/shared";
import { useState } from "react";
import { Switch, View } from "react-native";
import { Badge, Button, Card, Input, Screen, Text, useTheme } from "@rapportini/ui";
import { cents, euros, useAdminCatalog, useAdminMutation } from "../../../src/admin";
import { http } from "../../../src/api/client";
import { QueryState } from "../../../src/components/States";

function ModuleEditor({ module }: { module: ModuleDefRow }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(module.label);
  const [pitch, setPitch] = useState(module.pitch);
  const [price, setPrice] = useState(euros(module.priceCents));
  const [trial, setTrial] = useState(String(module.trialDays));
  const [error, setError] = useState<string | null>(null);
  const save = useAdminMutation((body: Partial<ModuleDefRow>) => http.patch(`/admin/modules/${module.key}`, body));

  async function submit(body: Partial<ModuleDefRow>) {
    setError(null);
    try {
      await save.mutateAsync(body);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Salvataggio non riuscito");
    }
  }

  return (
    <Card style={{ gap: 12, opacity: module.active ? 1 : 0.6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Ionicons name={module.icon as keyof typeof Ionicons.glyphMap} size={22} color={theme.colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{module.label}</Text>
          <Text variant="caption" muted>
            {module.priceCents ? `€ ${euros(module.priceCents)}/mese · ${module.trialDays} giorni di prova` : "Sempre gratis"}
          </Text>
        </View>
        <Switch
          accessibilityLabel={`Modulo ${module.label} attivo`}
          value={module.active}
          onValueChange={(active) => void submit({ active })}
          trackColor={{ true: theme.colors.accent, false: theme.colors.line }}
          thumbColor="#fff"
        />
      </View>
      {!module.active ? <Badge tone="warning" label="Spento per tutti i negozi" /> : null}
      {open ? (
        <View style={{ gap: 12 }}>
          <Input label="Nome" value={label} onChangeText={setLabel} />
          <Input label="Frase nello Store" value={pitch} onChangeText={setPitch} multiline />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input label="Prezzo €/mese" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Giorni di prova" value={trial} onChangeText={setTrial} keyboardType="number-pad" />
            </View>
          </View>
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          <Button
            label="Salva"
            loading={save.isPending}
            onPress={() => void submit({ label: label.trim(), pitch: pitch.trim(), priceCents: cents(price), trialDays: Math.min(90, Number.parseInt(trial, 10) || 0) })}
          />
        </View>
      ) : (
        <Button tone="ghost" label="Modifica" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}

export default function AdminModulesScreen() {
  const router = useRouter();
  const catalog = useAdminCatalog();
  return (
    <Screen onBack={() => router.back()} backLabel="Console">
      <Text variant="display">Moduli e prezzi</Text>
      <Text muted>Prezzo e prova valgono per i nuovi acquisti. Se spegni un modulo sparisce da tutte le app.</Text>
      <QueryState isLoading={catalog.isLoading} error={catalog.error} refetch={() => void catalog.refetch()}>
        {catalog.data?.modules.map((module) => <ModuleEditor key={`${module.key}:${module.priceCents}:${module.label}`} module={module} />)}
      </QueryState>
    </Screen>
  );
}
