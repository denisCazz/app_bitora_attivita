-- Families become generic: stoves are now a subcategory of field service.
ALTER TYPE "Vertical" RENAME VALUE 'STOVE_TECH' TO 'FIELD_SERVICE';

ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Catalog tables
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "parentId" TEXT,
    "family" "Vertical" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'apps-outline',
    "accent" TEXT,
    "image" TEXT,
    "terminology" JSONB NOT NULL DEFAULT '{}',
    "presets" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleDef" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pitch" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'apps-outline',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModuleDef_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "CategoryModule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "free" BOOLEAN,
    "tab" BOOLEAN,
    "sortOrder" INTEGER,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CategoryRole" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE INDEX "CategoryModule_moduleKey_idx" ON "CategoryModule"("moduleKey");
CREATE UNIQUE INDEX "CategoryModule_categoryId_moduleKey_key" ON "CategoryModule"("categoryId", "moduleKey");
CREATE UNIQUE INDEX "CategoryRole_categoryId_name_key" ON "CategoryRole"("categoryId", "name");

ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CategoryModule" ADD CONSTRAINT "CategoryModule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryModule" ADD CONSTRAINT "CategoryModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "ModuleDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryRole" ADD CONSTRAINT "CategoryRole_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starting catalog. Everything below is editable from the Bitora console.
INSERT INTO "ModuleDef" ("key", "label", "description", "pitch", "icon", "priceCents", "sortOrder") VALUES
  ('dashboard',   'Home',         'Riepilogo della giornata',        'La giornata a colpo d''occhio.',                        'grid-outline',       0,    0),
  ('work_orders', 'Interventi',   'Rapportini, ticket e lavori',     'Ticket di manutenzione con foto, firma e PDF.',         'construct-outline',  900,  1),
  ('customers',   'Clienti',      'Anagrafica clienti',              'Anagrafica con storico di ogni cliente.',               'people-outline',     500,  2),
  ('assets',      'Impianti',     'Impianti e attrezzature',         'Schede con matricola e storico interventi.',            'hardware-chip-outline', 900, 3),
  ('calendar',    'Calendario',   'Scadenze e appuntamenti',         'Scadenze e promemoria automatici.',                     'calendar-outline',   500,  4),
  ('spare_parts', 'Ricambi',      'Catalogo ricambi e codici',       'Catalogo ricambi con scansione del codice.',            'cog-outline',        900,  5),
  ('stock',       'Magazzino',    'Magazzino e furgone',             'Giacenze di magazzino e furgone.',                      'bus-outline',        700,  6),
  ('checklists',  'Checklist',    'Controlli e modelli',             'Controlli guidati, anche HACCP.',                       'checkbox-outline',   500,  7),
  ('floor',       'Sala',         'Tavoli e piantina',               'La tua sala, tavolo per tavolo.',                       'restaurant-outline', 900,  8),
  ('orders',      'Comande',      'Ordini verso bar e cucina',       'Comande dritte a bar e cucina.',                        'receipt-outline',    900,  9),
  ('menu',        'Menu',         'Piatti, varianti e prezzi',       'Piatti, prezzi e varianti.',                            'book-outline',       500, 10),
  ('inventory',   'Scorte',       'Ingredienti, ricette e scarichi', 'Ricette che scaricano il magazzino da sole.',           'layers-outline',    1200, 11),
  ('suppliers',   'Fornitori',    'Fornitori e ordini d''acquisto',  'Ordini ai fornitori e ricezione merce.',                'cube-outline',       700, 12),
  ('shifts',      'Turni',        'Turni del personale',             'Turni del personale in un tocco.',                      'time-outline',       700, 13),
  ('settings',    'Impostazioni', 'Ruoli, campi, moduli e stile',    'Ruoli, campi e aspetto del negozio.',                   'settings-outline',   0,   14);

INSERT INTO "Category" ("id", "key", "parentId", "family", "label", "description", "icon", "accent", "image", "terminology", "presets", "sortOrder") VALUES
  ('cat_field_service', 'field_service', NULL, 'FIELD_SERVICE', 'Assistenza tecnica',
   'Interventi, impianti, ricambi e rapportini per chi installa e ripara.', 'construct-outline', '#2F6FED', NULL,
   '{"workOrder":"Intervento","workOrders":"Interventi","asset":"Impianto","assets":"Impianti","customer":"Cliente","customers":"Clienti","sparePart":"Ricambio","spareParts":"Ricambi"}',
   '{"assetTypes":["Impianto","Apparecchio"],"checklists":[{"name":"Controllo generale","kind":"GENERIC","items":[{"id":"visual","label":"Controllo visivo"},{"id":"safety","label":"Verifica sicurezze"},{"id":"test","label":"Prova di funzionamento"}]}]}',
   0),
  ('cat_stoves', 'stoves', 'cat_field_service', 'FIELD_SERVICE', 'Stufe e camini',
   'Stufe a pellet e legna, termocamini, canne fumarie.', 'flame-outline', '#E25B2A', 'asset:stove',
   '{"asset":"Stufa","assets":"Stufe"}',
   '{"assetTypes":["Stufa a pellet","Stufa a legna","Termocamino","Caldaia a pellet"],"customFields":[{"entity":"ASSET","key":"fuel","label":"Combustibile","type":"SELECT","options":["Pellet","Legna","Gas","Combinata"]}],"checklists":[{"name":"Pulizia annuale","kind":"ANNUAL_CLEANING","items":[{"id":"body","label":"Pulizia camera di combustione"},{"id":"glass","label":"Pulizia vetro e guarnizioni"},{"id":"flue","label":"Controllo canna fumaria"},{"id":"draft","label":"Prova tiraggio"}]}],"sample":{"asset":{"name":"Stufa soggiorno","type":"Stufa a pellet","brand":"Piazzetta","model":"P963","serialNumber":"PZ-963-20411","customFields":{"fuel":"Pellet"}},"parts":[{"sku":"GUA-963","name":"Guarnizione sportello","brand":"Piazzetta","models":["P963","P960"],"barcode":"8001234567890","price":28.5},{"sku":"CAN-300","name":"Candeletta accensione","brand":"Universale","models":["P963"],"barcode":"8001234567891","price":42}],"workOrder":"Pulizia annuale P963","schedule":"Pulizia annuale"}}',
   0),
  ('cat_boilers', 'boilers', 'cat_field_service', 'FIELD_SERVICE', 'Caldaie',
   'Caldaie a gas e condensazione, controlli fumi, libretti.', 'thermometer-outline', '#D9480F', NULL,
   '{"asset":"Caldaia","assets":"Caldaie"}',
   '{"assetTypes":["Caldaia a condensazione","Caldaia a gas","Scaldabagno"],"customFields":[{"entity":"ASSET","key":"power_kw","label":"Potenza (kW)","type":"NUMBER","options":[]},{"entity":"ASSET","key":"booklet","label":"Codice libretto","type":"TEXT","options":[]}],"checklists":[{"name":"Controllo fumi","kind":"FLUE_CHECK","items":[{"id":"combustion","label":"Analisi di combustione"},{"id":"pressure","label":"Pressione impianto"},{"id":"vent","label":"Scarico fumi"}]}],"sample":{"asset":{"name":"Caldaia cucina","type":"Caldaia a condensazione","brand":"Vaillant","model":"ecoTEC plus","serialNumber":"VA-2291-778"},"parts":[{"sku":"VAL-3V","name":"Valvola tre vie","brand":"Vaillant","models":["ecoTEC plus"],"barcode":"8001234567892","price":96}],"workOrder":"Manutenzione annuale caldaia","schedule":"Controllo fumi"}}',
   1),
  ('cat_hvac', 'hvac', 'cat_field_service', 'FIELD_SERVICE', 'Climatizzazione',
   'Split, pompe di calore, sanificazioni e gas refrigerante.', 'snow-outline', '#0EA5E9', NULL,
   '{"asset":"Climatizzatore","assets":"Climatizzatori"}',
   '{"assetTypes":["Split","Multisplit","Pompa di calore"],"customFields":[{"entity":"ASSET","key":"refrigerant","label":"Gas refrigerante","type":"SELECT","options":["R32","R410A","R290"]}],"checklists":[{"name":"Sanificazione","kind":"GENERIC","items":[{"id":"filters","label":"Pulizia filtri"},{"id":"coil","label":"Sanificazione batteria"},{"id":"leak","label":"Prova perdite"}]}],"sample":{"asset":{"name":"Split camera","type":"Split","brand":"Daikin","model":"Perfera","serialNumber":"DK-5521"},"parts":[{"sku":"FIL-DK","name":"Filtro antibatterico","brand":"Daikin","models":["Perfera"],"barcode":"8001234567893","price":19}],"workOrder":"Sanificazione split","schedule":"Sanificazione"}}',
   2),
  ('cat_hospitality', 'hospitality', NULL, 'HOSPITALITY', 'Ristorazione',
   'Sala, comande, menu, magazzino, turni e attrezzature.', 'restaurant-outline', '#1C6B56', 'asset:bar',
   '{"workOrder":"Ticket","workOrders":"Manutenzioni","asset":"Attrezzatura","assets":"Attrezzature","customer":"Cliente","customers":"Clienti","sparePart":"Ricambio","spareParts":"Ricambi"}',
   '{"assetTypes":["Macchina caffè","Frigorifero","Forno","Lavastoviglie"],"checklists":[{"name":"HACCP apertura","kind":"HACCP","items":[{"id":"temps","label":"Temperature frigoriferi registrate"},{"id":"oil","label":"Olio di frittura verificato"},{"id":"surfaces","label":"Superfici sanificate"}]}]}',
   1),
  ('cat_bar', 'bar', 'cat_hospitality', 'HOSPITALITY', 'Bar e caffetterie',
   'Banco, tavoli, caffetteria e aperitivi.', 'cafe-outline', '#1C6B56', 'asset:bar', '{}', '{}', 0),
  ('cat_restaurant', 'restaurant', 'cat_hospitality', 'HOSPITALITY', 'Ristoranti e pizzerie',
   'Sala, cucina, comande per reparto e ricette.', 'pizza-outline', '#B4431E', NULL, '{}', '{}', 1);

INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "free", "tab", "sortOrder", "label") VALUES
  ('cm_fs_dashboard',   'cat_field_service', 'dashboard',   true,  true,  0, NULL),
  ('cm_fs_work_orders', 'cat_field_service', 'work_orders', true,  true,  1, NULL),
  ('cm_fs_customers',   'cat_field_service', 'customers',   true,  false, 2, NULL),
  ('cm_fs_assets',      'cat_field_service', 'assets',      false, true,  3, NULL),
  ('cm_fs_calendar',    'cat_field_service', 'calendar',    false, false, 4, NULL),
  ('cm_fs_spare_parts', 'cat_field_service', 'spare_parts', false, true,  5, NULL),
  ('cm_fs_stock',       'cat_field_service', 'stock',       false, false, 6, 'Furgone'),
  ('cm_fs_checklists',  'cat_field_service', 'checklists',  false, false, 7, NULL),
  ('cm_fs_settings',    'cat_field_service', 'settings',    true,  false, 99, NULL),
  ('cm_st_assets',      'cat_stoves',        'assets',      NULL,  NULL,  NULL, 'Stufe'),
  ('cm_bo_assets',      'cat_boilers',       'assets',      NULL,  NULL,  NULL, 'Caldaie'),
  ('cm_hv_assets',      'cat_hvac',          'assets',      NULL,  NULL,  NULL, 'Climatizzatori'),
  ('cm_ho_dashboard',   'cat_hospitality',   'dashboard',   true,  true,  0, NULL),
  ('cm_ho_floor',       'cat_hospitality',   'floor',       true,  true,  1, NULL),
  ('cm_ho_orders',      'cat_hospitality',   'orders',      true,  true,  2, NULL),
  ('cm_ho_menu',        'cat_hospitality',   'menu',        true,  true,  3, NULL),
  ('cm_ho_inventory',   'cat_hospitality',   'inventory',   false, false, 4, NULL),
  ('cm_ho_suppliers',   'cat_hospitality',   'suppliers',   false, false, 5, NULL),
  ('cm_ho_shifts',      'cat_hospitality',   'shifts',      false, false, 6, NULL),
  ('cm_ho_checklists',  'cat_hospitality',   'checklists',  false, false, 7, NULL),
  ('cm_ho_assets',      'cat_hospitality',   'assets',      false, false, 8, 'Attrezzature'),
  ('cm_ho_work_orders', 'cat_hospitality',   'work_orders', false, false, 9, 'Manutenzioni'),
  ('cm_ho_calendar',    'cat_hospitality',   'calendar',    false, false, 10, NULL),
  ('cm_ho_settings',    'cat_hospitality',   'settings',    true,  false, 99, NULL);

INSERT INTO "CategoryRole" ("id", "categoryId", "name", "owner", "permissions", "sortOrder") VALUES
  ('cr_fs_owner', 'cat_field_service', 'Titolare', true,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','spare_parts.read','spare_parts.write','stock.read','stock.adjust','floor.read','floor.write','orders.read','orders.write','orders.void','menu.read','menu.write','inventory.read','inventory.write','suppliers.read','suppliers.write','shifts.read','shifts.write','settings.manage','team.manage'], 0),
  ('cr_fs_manager', 'cat_field_service', 'Responsabile', false,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','spare_parts.read','spare_parts.write','stock.read','stock.adjust','team.manage'], 1),
  ('cr_fs_tech', 'cat_field_service', 'Tecnico', false,
   ARRAY['dashboard.view','customers.read','assets.read','assets.write','work_orders.read','work_orders.write','checklists.read','schedules.read','spare_parts.read','stock.read','stock.adjust'], 2),
  ('cr_ho_owner', 'cat_hospitality', 'Titolare', true,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','spare_parts.read','spare_parts.write','stock.read','stock.adjust','floor.read','floor.write','orders.read','orders.write','orders.void','menu.read','menu.write','inventory.read','inventory.write','suppliers.read','suppliers.write','shifts.read','shifts.write','settings.manage','team.manage'], 0),
  ('cr_ho_manager', 'cat_hospitality', 'Responsabile', false,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','floor.read','floor.write','orders.read','orders.write','orders.void','menu.read','menu.write','inventory.read','inventory.write','suppliers.read','suppliers.write','shifts.read','shifts.write','team.manage'], 1),
  ('cr_ho_waiter', 'cat_hospitality', 'Cameriere', false,
   ARRAY['dashboard.view','floor.read','orders.read','orders.write','menu.read','shifts.read'], 2),
  ('cr_ho_kitchen', 'cat_hospitality', 'Cucina', false,
   ARRAY['dashboard.view','orders.read','orders.write','menu.read','inventory.read','checklists.read','assets.read','work_orders.read'], 3);

-- Existing shops move into a subcategory.
ALTER TABLE "Tenant" ADD COLUMN "categoryId" TEXT;
UPDATE "Tenant" SET "categoryId" = CASE WHEN "vertical" = 'FIELD_SERVICE' THEN 'cat_stoves' ELSE 'cat_bar' END;
ALTER TABLE "Tenant" ALTER COLUMN "categoryId" SET NOT NULL;
CREATE INDEX "Tenant_categoryId_idx" ON "Tenant"("categoryId");
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Assets become generic: a free type plus custom fields (fuel moves there).
ALTER TABLE "Asset" ADD COLUMN "type" TEXT;
UPDATE "Asset" SET
  "type" = CASE
    WHEN "kind" = 'STOVE' AND "fuel" = 'WOOD' THEN 'Stufa a legna'
    WHEN "kind" = 'STOVE' THEN 'Stufa a pellet'
    ELSE NULL END,
  "customFields" = CASE
    WHEN "fuel" IS NULL THEN "customFields"
    ELSE "customFields" || jsonb_build_object('fuel', CASE "fuel"
      WHEN 'PELLET' THEN 'Pellet' WHEN 'WOOD' THEN 'Legna' WHEN 'GAS' THEN 'Gas' WHEN 'MULTI' THEN 'Combinata' ELSE 'Altro' END)
    END;

INSERT INTO "CustomFieldDef" ("id", "tenantId", "entity", "key", "label", "type", "options", "updatedAt")
SELECT 'cfd_' || md5(t."id" || 'fuel'), t."id", 'ASSET', 'fuel', 'Combustibile', 'SELECT', '["Pellet","Legna","Gas","Combinata"]'::jsonb, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE t."categoryId" = 'cat_stoves'
ON CONFLICT ("tenantId", "entity", "key") DO NOTHING;

ALTER TABLE "Asset" DROP COLUMN "kind", DROP COLUMN "fuel";
DROP TYPE "AssetKind";
DROP TYPE "FuelType";
