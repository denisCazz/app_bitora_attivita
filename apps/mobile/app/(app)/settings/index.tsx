import { useRouter } from "expo-router";
import { useState } from "react";
import { Button, Card, Input, ListItem, Screen, Text } from "@rapportini/ui";
import { http } from "../../../src/api/client";
import { t } from "../../../src/i18n";
import { useManifest } from "../../../src/session";

export default function SettingsScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);

  async function loadRoles() {
    if (!roles.length) setRoles(await http.get("/roles"));
  }

  async function invite(roleId: string) {
    const result = await http.post<{ token: string }>("/team/invites", { email, roleId });
    setToken(result.token);
  }

  return (
    <Screen>
      <Text variant="display">Impostazioni</Text>
      <Text muted>{manifest.data?.tenant.name}</Text>
      <Card>
        <ListItem title="Ruoli e permessi" subtitle="Chi può fare cosa" onPress={() => router.push("/(app)/settings/roles")} />
        <ListItem title="Campi personalizzati" subtitle="Domande in più sulle schede" onPress={() => router.push("/(app)/settings/fields")} />
        <ListItem title="Checklist" subtitle="Modelli di controllo" onPress={() => router.push("/(app)/settings/checklists")} />
        <ListItem title="Moduli" subtitle="Accendi o spegni le sezioni" onPress={() => router.push("/(app)/settings/modules")} />
        <ListItem title="Piano e Store" subtitle="Sblocca moduli, prova gratis 14 giorni" onPress={() => router.push("/(app)/store")} />
        <ListItem title="Aspetto e parole" subtitle="Colore e terminologia" onPress={() => router.push("/(app)/settings/branding")} />
      </Card>
      <Text variant="title">Invita qualcuno</Text>
      <Input label="Email" autoCapitalize="none" value={email} onChangeText={setEmail} onFocus={() => void loadRoles()} />
      {roles.filter((role) => role.name !== "Titolare").map((role) => (
        <Button key={role.id} label={`Invita come ${role.name}`} tone="secondary" onPress={() => void invite(role.id)} />
      ))}
      {token ? <Text>Codice invito: {token}</Text> : null}
      <Text variant="caption" muted>
        {t("developedBy")}
      </Text>
    </Screen>
  );
}
