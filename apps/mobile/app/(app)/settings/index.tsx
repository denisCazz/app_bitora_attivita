import { useRouter } from "expo-router";
import { Card, ListItem, Screen, Text } from "@rapportini/ui";
import { t } from "../../../src/i18n";
import { useManifest } from "../../../src/session";

export default function SettingsScreen() {
  const router = useRouter();
  const manifest = useManifest();

  return (
    <Screen>
      <Text variant="display">Impostazioni</Text>
      <Text muted>{manifest.data?.tenant.name}</Text>
      <Card>
        <ListItem title="Persone" subtitle="3 utenti inclusi, poi 5€ al mese" onPress={() => router.push("/(app)/settings/team")} />
        <ListItem title="Ruoli e permessi" subtitle="Chi può fare cosa" onPress={() => router.push("/(app)/settings/roles")} />
        <ListItem title="Campi personalizzati" subtitle="Domande in più sulle schede" onPress={() => router.push("/(app)/settings/fields")} />
        <ListItem title="Checklist" subtitle="Modelli di controllo" onPress={() => router.push("/(app)/settings/checklists")} />
        <ListItem title="Moduli" subtitle="Accendi o spegni le sezioni" onPress={() => router.push("/(app)/settings/modules")} />
        <ListItem title="Piano e Store" subtitle="Sblocca moduli, prova gratis 14 giorni" onPress={() => router.push("/(app)/store")} />
        <ListItem title="Aspetto e parole" subtitle="Colore e terminologia" onPress={() => router.push("/(app)/settings/branding")} />
      </Card>
      <Text variant="caption" muted>
        {t("developedBy")}
      </Text>
    </Screen>
  );
}
