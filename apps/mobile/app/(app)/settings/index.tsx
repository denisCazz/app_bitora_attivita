import { useRouter } from "expo-router";
import { Screen, Text } from "@rapportini/ui";
import { Menu, MenuRow } from "../../../src/components/Menu";
import { t } from "../../../src/i18n";
import { useManifest } from "../../../src/session";

export default function SettingsScreen() {
  const router = useRouter();
  const manifest = useManifest();

  return (
    <Screen>
      <Text variant="display">Impostazioni</Text>
      <Text muted>{manifest.data?.tenant.name}</Text>
      <Menu title="Persone">
        <MenuRow icon="people-outline" title="Dipendenti" subtitle="3 utenti inclusi, poi 5€ al mese" onPress={() => router.push("/(app)/settings/team")} />
        <MenuRow icon="shield-checkmark-outline" title="Ruoli e permessi" subtitle="Chi può fare cosa" onPress={() => router.push("/(app)/settings/roles")} />
      </Menu>
      <Menu title="Schede e controlli">
        <MenuRow icon="create-outline" title="Campi personalizzati" subtitle="Domande in più sulle schede" onPress={() => router.push("/(app)/settings/fields")} />
        <MenuRow icon="checkbox-outline" title="Checklist" subtitle="Modelli di controllo" onPress={() => router.push("/(app)/settings/checklists")} />
      </Menu>
      <Menu title="La tua app">
        <MenuRow icon="color-palette-outline" title="Aspetto e parole" subtitle="Logo, colore e terminologia" onPress={() => router.push("/(app)/settings/branding")} />
        <MenuRow icon="apps-outline" title="Moduli" subtitle="Accendi o spegni le sezioni" onPress={() => router.push("/(app)/settings/modules")} />
        <MenuRow icon="storefront-outline" title="Piano e Store" subtitle="Scopri e sblocca i moduli" onPress={() => router.push("/(app)/store")} />
      </Menu>
      <Menu title="Clienti e pagamenti">
        <MenuRow icon="card-outline" title="Incassi" subtitle="Stripe, Revolut o Satispay" onPress={() => router.push("/(app)/settings/payments")} />
        <MenuRow icon="notifications-outline" title="Promemoria ai clienti" subtitle="Avvisi prima delle scadenze" onPress={() => router.push("/(app)/settings/reminders")} />
      </Menu>
      <Text variant="caption" muted style={{ textAlign: "center" }}>
        {t("developedBy")}
      </Text>
    </Screen>
  );
}
