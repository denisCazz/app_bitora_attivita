import type { ModuleKey } from "./modules";
import { PERMISSIONS, type Permission } from "./permissions";

export interface PermissionText {
  module: ModuleKey;
  section: string;
  label: string;
  description: string;
}

export const PERMISSION_COPY: Record<Permission, PermissionText> = {
  "dashboard.view": {
    module: "dashboard",
    section: "Panoramica",
    label: "Vedere la giornata",
    description: "Numeri, attività e promemoria di oggi",
  },
  "customers.read": {
    module: "customers",
    section: "Clienti",
    label: "Solo consultare",
    description: "Apre l'elenco e le schede, senza modificarle",
  },
  "customers.write": {
    module: "customers",
    section: "Clienti",
    label: "Creare e modificare",
    description: "Aggiunge, aggiorna i dati e cancella",
  },
  "assets.read": {
    module: "assets",
    section: "Impianti",
    label: "Solo consultare",
    description: "Apre schede, storico e documenti",
  },
  "assets.write": {
    module: "assets",
    section: "Impianti",
    label: "Creare e modificare",
    description: "Aggiunge, aggiorna e cancella",
  },
  "work_orders.read": {
    module: "work_orders",
    section: "Interventi",
    label: "Solo consultare",
    description: "Vede quelli aperti e lo storico",
  },
  "work_orders.write": {
    module: "work_orders",
    section: "Interventi",
    label: "Creare e chiudere",
    description: "Apre un lavoro, lo aggiorna e lo completa",
  },
  "work_orders.assign": {
    module: "work_orders",
    section: "Interventi",
    label: "Assegnare a qualcuno",
    description: "Sceglie chi se ne occupa",
  },
  "checklists.read": {
    module: "checklists",
    section: "Checklist",
    label: "Compilare sul campo",
    description: "Segna le voci mentre lavora",
  },
  "checklists.manage": {
    module: "checklists",
    section: "Checklist",
    label: "Creare i modelli",
    description: "Prepara e cambia le liste di controllo",
  },
  "schedules.read": {
    module: "calendar",
    section: "Calendario",
    label: "Solo consultare",
    description: "Vede appuntamenti e scadenze",
  },
  "schedules.write": {
    module: "calendar",
    section: "Calendario",
    label: "Creare e spostare",
    description: "Mette, cambia e cancella gli appuntamenti",
  },
  "spare_parts.read": {
    module: "spare_parts",
    section: "Ricambi",
    label: "Solo consultare",
    description: "Vede codici, prezzi e su cosa si montano",
  },
  "spare_parts.write": {
    module: "spare_parts",
    section: "Ricambi",
    label: "Aggiornare l'elenco",
    description: "Aggiunge articoli e cambia i dati",
  },
  "stock.read": {
    module: "stock",
    section: "Magazzino",
    label: "Vedere le quantità",
    description: "Controlla quanto ce n'è",
  },
  "stock.adjust": {
    module: "stock",
    section: "Magazzino",
    label: "Correggere le quantità",
    description: "Registra carichi, scarichi e rettifiche",
  },
  "floor.read": {
    module: "floor",
    section: "Sala",
    label: "Vedere la sala",
    description: "Controlla tavoli e posti",
  },
  "floor.write": {
    module: "floor",
    section: "Sala",
    label: "Sistemare i tavoli",
    description: "Apre, unisce e sposta",
  },
  "orders.read": {
    module: "orders",
    section: "Ordini",
    label: "Solo consultare",
    description: "Vede comande e conto",
  },
  "orders.write": {
    module: "orders",
    section: "Ordini",
    label: "Prendere e modificare",
    description: "Aggiunge piatti e aggiorna la comanda",
  },
  "orders.void": {
    module: "orders",
    section: "Ordini",
    label: "Annullare",
    description: "Storna una comanda già inviata",
  },
  "menu.read": {
    module: "menu",
    section: "Menu",
    label: "Solo consultare",
    description: "Vede piatti, prezzi e cosa è disponibile",
  },
  "menu.write": {
    module: "menu",
    section: "Menu",
    label: "Cambiare piatti e prezzi",
    description: "Aggiunge, nasconde e aggiorna le voci",
  },
  "inventory.read": {
    module: "inventory",
    section: "Scorte",
    label: "Solo consultare",
    description: "Vede cosa c'è in cucina e al bar",
  },
  "inventory.write": {
    module: "inventory",
    section: "Scorte",
    label: "Aggiornare le scorte",
    description: "Segna entrate e uscite",
  },
  "suppliers.read": {
    module: "suppliers",
    section: "Fornitori",
    label: "Solo consultare",
    description: "Vede nomi e contatti",
  },
  "suppliers.write": {
    module: "suppliers",
    section: "Fornitori",
    label: "Creare e modificare",
    description: "Aggiunge fornitori e aggiorna i dati",
  },
  "shifts.read": {
    module: "shifts",
    section: "Turni",
    label: "Solo consultare",
    description: "Vede chi lavora e quando",
  },
  "shifts.write": {
    module: "shifts",
    section: "Turni",
    label: "Organizzare i turni",
    description: "Crea, cambia e cancella",
  },
  "settings.manage": {
    module: "settings",
    section: "Impostazioni",
    label: "Impostazioni del negozio",
    description: "Moduli, campi, checklist, ruoli e aspetto",
  },
  "team.manage": {
    module: "settings",
    section: "Impostazioni",
    label: "Gestire gli utenti",
    description: "Invita, cambia ruolo e rimuove. Tre inclusi, poi 5€ al mese",
  },
};

export interface PermissionRow {
  permission: Permission;
  module: ModuleKey;
  section: string;
  label: string;
  description: string;
}

export function permissionRows(catalog?: ReadonlyArray<{ key: string; label: string }> | null): PermissionRow[] {
  const labels = new Map((catalog ?? []).map((item) => [item.key, item.label]));
  return PERMISSIONS.filter((permission) => !catalog || labels.has(PERMISSION_COPY[permission].module)).map((permission) => {
    const copy = PERMISSION_COPY[permission];
    return {
      permission,
      module: copy.module,
      section: labels.get(copy.module) || copy.section,
      label: copy.label,
      description: copy.description,
    };
  });
}
