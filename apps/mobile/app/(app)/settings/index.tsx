import { useRouter } from "expo-router";
import { Screen, Text } from "@rapportini/ui";
import { Menu, MenuRow } from "../../../src/components/Menu";
import { t } from "../../../src/i18n";
import { can, useManifest, useMenu } from "../../../src/session";

const FALLBACK = [
  { key: "people", label: "Persone", children: [
    { key: "team", label: "Dipendenti", subtitle: "Persone del negozio", icon: "people-outline", route: "/settings/team" },
    { key: "roles", label: "Ruoli e permessi", subtitle: "Chi può fare cosa", icon: "shield-checkmark-outline", route: "/settings/roles" },
  ]},
  { key: "records", label: "Schede e controlli", children: [
    { key: "fields", label: "Campi personalizzati", subtitle: "Domande in più sulle schede", icon: "create-outline", route: "/settings/fields" },
    { key: "checklists", label: "Checklist", subtitle: "Modelli di controllo", icon: "checkbox-outline", route: "/settings/checklists" },
  ]},
  { key: "app", label: "La tua app", children: [
    { key: "branding", label: "Aspetto e parole", subtitle: "Logo, colore e terminologia", icon: "color-palette-outline", route: "/settings/branding" },
    { key: "modules", label: "Moduli", subtitle: "Accendi o spegni le sezioni", icon: "apps-outline", route: "/settings/modules" },
    { key: "store", label: "Piano e Store", subtitle: "Scopri e sblocca i moduli", icon: "storefront-outline", route: "/store" },
    { key: "menu", label: "Voci dell'app", subtitle: "Cosa compare nella barra e in Altro", icon: "list-outline", route: "/settings/menu" },
    { key: "vocab", label: "Vocabolari", subtitle: "Tipi, reparti, categorie", icon: "pricetags-outline", route: "/settings/vocab" },
  ]},
  { key: "pay", label: "Clienti e pagamenti", children: [
    { key: "payments", label: "Incassi", subtitle: "Stripe, Revolut o Satispay", icon: "card-outline", route: "/settings/payments" },
    { key: "reminders", label: "Promemoria ai clienti", subtitle: "Avvisi prima delle scadenze", icon: "notifications-outline", route: "/settings/reminders" },
  ]},
];

export default function SettingsScreen() {
  const router = useRouter();
  const manifest = useManifest();
  const menu = useMenu("SETTINGS");
  const groups = menu.filter((item) => item.kind === "GROUP");
  const rows = menu.filter((item) => item.kind !== "GROUP" && (!item.permission || can(manifest.data, item.permission)));
  const sections = groups.length
    ? groups.map((group) => ({ key: group.key, label: group.label, children: rows.filter((row) => row.parentKey === group.key) }))
    : FALLBACK;

  return (
    <Screen>
      <Text variant="display">Impostazioni</Text>
      <Text muted>{manifest.data?.tenant.name}</Text>
      {sections.map((section) => (
        <Menu key={section.key} title={section.label}>
          {section.children.map((row) => (
            <MenuRow
              key={row.key}
              icon={(row.icon ?? "ellipse-outline") as "ellipse-outline"}
              title={row.label}
              subtitle={"subtitle" in row ? row.subtitle ?? undefined : undefined}
              onPress={() => {
                const route = row.route ?? "";
                if (!route) return;
                router.push((route.startsWith("/settings") || route.startsWith("/store") ? `/(app)${route}` : `/(app)${route}`) as never);
              }}
            />
          ))}
        </Menu>
      ))}
      <Text variant="caption" muted style={{ textAlign: "center" }}>
        {t("developedBy")}
      </Text>
    </Screen>
  );
}
