import {
  assetSchema,
  checklistRunSchema,
  checklistTemplateSchema,
  closeOrderSchema,
  customerSchema,
  ingredientSchema,
  isUsable,
  menuItemSchema,
  modifierSchema,
  orderLineSchema,
  purchaseOrderSchema,
  recipeSchema,
  scheduleSchema,
  shiftSchema,
  sparePartSchema,
  stockAdjustSchema,
  stockLocationSchema,
  stockTransferSchema,
  supplierSchema,
  tableSchema,
  workOrderSchema,
  type Manifest,
  type ModuleKey,
  type Permission,
} from "@rapportini/shared";
import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Action {
  name: string;
  title: string;
  description: string;
  method: Method;
  path: string;
  permission: Permission;
  module?: ModuleKey;
  query?: z.AnyZodObject;
  body?: ZodTypeAny;
  write: boolean;
}

const q = z.object({ q: z.string().optional().describe("Testo da cercare") });

function read(name: string, title: string, description: string, path: string, permission: Permission, module?: ModuleKey, query?: z.AnyZodObject): Action {
  return { name, title, description, method: "GET", path, permission, module, query, write: false };
}

function write(name: string, title: string, description: string, method: Method, path: string, permission: Permission, module?: ModuleKey, body?: ZodTypeAny): Action {
  return { name, title, description, method, path, permission, module, body, write: true };
}

const ACTIONS: Action[] = [
  read("get_dashboard", "Riepilogo", "Numeri principali: interventi aperti, scadenze vicine, comande aperte, ricambi sotto scorta.", "/dashboard", "dashboard.view", "dashboard"),

  read("search_customers", "Cerca clienti", "Cerca clienti per nome (max 100). Senza q elenca tutti.", "/customers", "customers.read", undefined, q),
  read("get_customer", "Scheda cliente", "Dettaglio cliente con impianti e ultimi interventi.", "/customers/:id", "customers.read"),
  write("create_customer", "Nuovo cliente", "Crea un cliente.", "POST", "/customers", "customers.write", undefined, customerSchema),
  write("update_customer", "Modifica cliente", "Aggiorna i campi di un cliente.", "PATCH", "/customers/:id", "customers.write", undefined, customerSchema.partial()),
  write("delete_customer", "Elimina cliente", "Elimina un cliente senza dati collegati.", "DELETE", "/customers/:id", "customers.write"),

  read("search_assets", "Cerca impianti", "Cerca impianti/apparecchi per nome, modello o matricola, opzionalmente di un cliente.", "/assets", "assets.read", "assets", q.extend({ customerId: z.string().optional() })),
  read("get_asset", "Scheda impianto", "Dettaglio impianto con interventi e scadenze.", "/assets/:id", "assets.read", "assets"),
  write("create_asset", "Nuovo impianto", "Registra un impianto/apparecchio, di solito collegato a un cliente.", "POST", "/assets", "assets.write", "assets", assetSchema),
  write("update_asset", "Modifica impianto", "Aggiorna un impianto.", "PATCH", "/assets/:id", "assets.write", "assets", assetSchema.partial()),

  read("list_work_orders", "Interventi", "Elenca interventi, filtrabili per stato.", "/work-orders", "work_orders.read", "work_orders", z.object({ status: z.enum(["DRAFT", "SCHEDULED", "IN_PROGRESS", "DONE", "CANCELLED"]).optional() })),
  read("get_work_order", "Dettaglio intervento", "Dettaglio intervento con cliente, impianto, ricambi e checklist.", "/work-orders/:id", "work_orders.read", "work_orders"),
  write("create_work_order", "Nuovo intervento", "Crea/pianifica un intervento. scheduledAt in ISO 8601 con fuso orario.", "POST", "/work-orders", "work_orders.write", "work_orders", workOrderSchema),
  write("update_work_order", "Modifica intervento", "Aggiorna un intervento (stato, data, tecnico, descrizione).", "PATCH", "/work-orders/:id", "work_orders.write", "work_orders", workOrderSchema.partial()),
  write(
    "add_part_to_work_order",
    "Scarica ricambio su intervento",
    "Registra un ricambio usato in un intervento, scaricandolo dal magazzino indicato.",
    "POST",
    "/work-orders/:id/parts",
    "stock.adjust",
    "work_orders",
    z.object({ partId: z.string(), locationId: z.string(), quantity: z.number().positive() }),
  ),

  read("list_checklist_templates", "Modelli checklist", "Elenca i modelli di checklist.", "/checklist-templates", "checklists.read", "checklists"),
  read("list_checklist_runs", "Checklist compilate", "Ultime checklist compilate.", "/checklist-runs", "checklists.read", "checklists"),
  write("create_checklist_template", "Nuovo modello checklist", "Crea un modello di checklist.", "POST", "/checklist-templates", "checklists.manage", "checklists", checklistTemplateSchema),
  write("update_checklist_template", "Modifica modello checklist", "Aggiorna un modello di checklist.", "PATCH", "/checklist-templates/:id", "checklists.manage", "checklists", checklistTemplateSchema.partial()),
  write("delete_checklist_template", "Elimina modello checklist", "Elimina un modello di checklist.", "DELETE", "/checklist-templates/:id", "checklists.manage", "checklists"),
  write("create_checklist_run", "Compila checklist", "Registra una checklist compilata.", "POST", "/checklist-runs", "checklists.read", "checklists", checklistRunSchema),

  read("list_schedules", "Scadenze", "Elenca le scadenze/manutenzioni programmate.", "/schedules", "schedules.read", "calendar"),
  read(
    "get_agenda",
    "Agenda",
    "Appuntamenti e interventi in un intervallo, ognuno con inizio, fine e durata reali (start/end). Usala per verificare se un orario è libero.",
    "/agenda",
    "schedules.read",
    "calendar",
    z.object({ from: z.string().describe("Inizio intervallo ISO 8601"), to: z.string().describe("Fine intervallo ISO 8601") }),
  ),
  write(
    "create_schedule",
    "Nuovo appuntamento",
    "Crea un appuntamento o una scadenza. kind deve essere uno dei tipi del negozio. dueAt ISO 8601. durationMinutes solo se l'utente indica una durata diversa da quella predefinita del tipo. La risposta contiene overlaps: appuntamenti che si sovrappongono (è solo un avviso).",
    "POST",
    "/schedules",
    "schedules.write",
    "calendar",
    scheduleSchema,
  ),
  write("update_schedule", "Modifica scadenza", "Aggiorna una scadenza.", "PATCH", "/schedules/:id", "schedules.write", "calendar", scheduleSchema.partial()),
  write("delete_schedule", "Elimina scadenza", "Elimina una scadenza.", "DELETE", "/schedules/:id", "schedules.write", "calendar"),

  read("search_spare_parts", "Cerca ricambi", "Cerca ricambi per testo o modello compatibile.", "/spare-parts", "spare_parts.read", "spare_parts", q.extend({ model: z.string().optional() })),
  write("create_spare_part", "Nuovo ricambio", "Aggiunge un ricambio al catalogo.", "POST", "/spare-parts", "spare_parts.write", "spare_parts", sparePartSchema),

  read("list_stock_locations", "Magazzini", "Elenca magazzini, furgoni e punti di stoccaggio.", "/stock/locations", "stock.read", "stock"),
  read("get_stock_balances", "Giacenze", "Giacenze attuali di ricambi e ingredienti per ubicazione.", "/stock/balances", "stock.read"),
  write("create_stock_location", "Nuova ubicazione", "Crea un magazzino/furgone/punto.", "POST", "/stock/locations", "stock.adjust", "stock", stockLocationSchema),
  write("adjust_stock", "Movimento magazzino", "Carico (quantità positiva) o scarico (negativa) di un ricambio o ingrediente.", "POST", "/stock/movements", "stock.adjust", undefined, stockAdjustSchema),
  write("transfer_stock", "Trasferimento magazzino", "Sposta merce tra due ubicazioni.", "POST", "/stock/transfers", "stock.adjust", "stock", stockTransferSchema),

  read("list_tables", "Tavoli", "Elenca i tavoli con l'eventuale comanda aperta (openOrder).", "/tables", "floor.read", "floor"),
  write("create_table", "Nuovo tavolo", "Crea un tavolo in sala.", "POST", "/tables", "floor.write", "floor", tableSchema),
  write("update_table", "Modifica tavolo", "Rinomina, cambia posti o posizione di un tavolo.", "PATCH", "/tables/:id", "floor.write", "floor", tableSchema.partial()),
  write("delete_table", "Elimina tavolo", "Elimina un tavolo senza comande collegate.", "DELETE", "/tables/:id", "floor.write", "floor"),

  read("list_menu", "Menu", "Elenca tutte le voci del menu con prezzi, disponibilità e varianti.", "/menu-items", "menu.read", "menu"),
  read("list_modifiers", "Varianti", "Elenca le varianti (aggiunte/modifiche) disponibili.", "/modifiers", "menu.read", "menu"),
  write("create_menu_item", "Nuova voce di menu", "Aggiunge una voce al menu.", "POST", "/menu-items", "menu.write", "menu", menuItemSchema),
  write("update_menu_item", "Modifica voce di menu", "Aggiorna prezzo, nome, disponibilità o varianti di una voce.", "PATCH", "/menu-items/:id", "menu.write", "menu", menuItemSchema.partial()),
  write("delete_menu_item", "Elimina voce di menu", "Elimina una voce dal menu.", "DELETE", "/menu-items/:id", "menu.write", "menu"),
  write("create_modifier", "Nuova variante", "Crea una variante con eventuale sovrapprezzo.", "POST", "/modifiers", "menu.write", "menu", modifierSchema),

  read("list_orders", "Comande", "Elenca le comande (di default quelle aperte).", "/orders", "orders.read", "orders", z.object({ status: z.enum(["OPEN", "SENT", "PARTIAL", "CLOSED", "VOID"]).optional() })),
  read("get_order", "Dettaglio comanda", "Dettaglio di una comanda con righe e tavolo.", "/orders/:id", "orders.read", "orders"),
  write(
    "open_order",
    "Apri comanda",
    "Apre una nuova comanda, di solito su un tavolo. Usala solo se il tavolo non ha già una comanda aperta.",
    "POST",
    "/orders",
    "orders.write",
    "orders",
    z.object({ tableId: z.string().optional(), covers: z.number().int().min(1).max(50).optional(), notes: z.string().max(200).optional() }),
  ),
  write("add_order_line", "Aggiungi alla comanda", "Aggiunge una riga alla comanda. Usa sempre menuItemId di una voce esistente del menu.", "POST", "/orders/:id/lines", "orders.write", "orders", orderLineSchema),
  write("send_order", "Invia comanda", "Invia in cucina/bar le righe in attesa.", "POST", "/orders/:id/send", "orders.write", "orders"),
  write(
    "update_order_line",
    "Stato riga comanda",
    "Cambia lo stato di una riga (es. SERVED o VOID per stornarla).",
    "PATCH",
    "/orders/:id/lines/:lineId",
    "orders.write",
    "orders",
    z.object({ status: z.enum(["PENDING", "SENT", "READY", "SERVED", "VOID"]) }),
  ),
  write("close_order", "Chiudi conto", "Chiude la comanda registrando i pagamenti; la somma deve essere uguale al totale.", "POST", "/orders/:id/close", "orders.write", "orders", closeOrderSchema),
  write("void_order", "Annulla comanda", "Annulla una comanda non ancora chiusa.", "POST", "/orders/:id/void", "orders.void", "orders"),

  read("list_ingredients", "Ingredienti", "Elenca gli ingredienti di magazzino.", "/ingredients", "inventory.read", "inventory"),
  write("create_ingredient", "Nuovo ingrediente", "Crea un ingrediente.", "POST", "/ingredients", "inventory.write", "inventory", ingredientSchema),
  write("set_recipe", "Imposta ricetta", "Sostituisce la ricetta (ingredienti e dosi) di una voce di menu.", "PUT", "/recipes", "inventory.write", "inventory", recipeSchema),

  read("list_suppliers", "Fornitori", "Elenca i fornitori con gli ultimi ordini.", "/suppliers", "suppliers.read", "suppliers"),
  write("create_supplier", "Nuovo fornitore", "Crea un fornitore.", "POST", "/suppliers", "suppliers.write", "suppliers", supplierSchema),
  write("create_purchase_order", "Ordine a fornitore", "Crea un ordine d'acquisto verso un fornitore.", "POST", "/purchase-orders", "suppliers.write", "suppliers", purchaseOrderSchema),
  write(
    "receive_purchase_order",
    "Ricevi ordine fornitore",
    "Segna come ricevuto un ordine e carica gli ingredienti nell'ubicazione indicata.",
    "POST",
    "/purchase-orders/:id/receive",
    "inventory.write",
    "suppliers",
    z.object({ locationId: z.string() }),
  ),

  read("list_shifts", "Turni", "Elenca i turni del personale.", "/shifts", "shifts.read", "shifts"),
  write("create_shift", "Nuovo turno", "Crea un turno. Date ISO 8601.", "POST", "/shifts", "shifts.write", "shifts", shiftSchema),
  write("update_shift", "Modifica turno", "Aggiorna un turno.", "PATCH", "/shifts/:id", "shifts.write", "shifts", shiftSchema.partial()),

  read("list_team", "Squadra", "Elenca le persone del negozio (per assegnare interventi o turni).", "/team", "team.manage"),
];

export function availableActions(manifest: Manifest): Action[] {
  const permissions = manifest.role.permissions;
  return ACTIONS.filter((action) => {
    if (!permissions.includes(action.permission)) return false;
    if (!action.module) return true;
    const module = manifest.modules.find((row) => row.key === action.module);
    return Boolean(module && isUsable(module.status));
  });
}

export function pathParams(action: Action): string[] {
  return [...action.path.matchAll(/:(\w+)/g)].map((match) => match[1]!);
}

function jsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  return rest;
}

export function toolDefinition(action: Action) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const param of pathParams(action)) {
    properties[param] = { type: "string", description: "ID ottenuto da una ricerca" };
    required.push(param);
  }
  if (action.query) properties.query = jsonSchema(action.query);
  if (action.body) {
    properties.body = jsonSchema(action.body);
    required.push("body");
  }
  if (action.write) {
    properties.summary = { type: "string", description: "Riepilogo in italiano, breve e concreto, di cosa farai (mostrato all'utente per la conferma)" };
    required.push("summary");
  }
  return {
    type: "function" as const,
    function: {
      name: action.name,
      description: `${action.description}${action.write ? " Modifica i dati: l'app chiederà conferma all'utente." : ""}`,
      parameters: { type: "object", properties, required },
    },
  };
}
