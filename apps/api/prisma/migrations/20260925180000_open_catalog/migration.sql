-- The sector is the root of the category tree: no more hard-coded families.
ALTER TABLE "Tenant" DROP COLUMN "vertical";
ALTER TABLE "Category" DROP COLUMN "family";
DROP TYPE "Vertical";

-- Sector words become data: kinds and stations are free keys labelled by category presets.
ALTER TABLE "ChecklistTemplate" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "ChecklistTemplate" ALTER COLUMN "kind" TYPE TEXT USING "kind"::TEXT;
ALTER TABLE "ChecklistTemplate" ALTER COLUMN "kind" SET DEFAULT 'GENERIC';
ALTER TABLE "Schedule" ALTER COLUMN "kind" TYPE TEXT USING "kind"::TEXT;
DROP TYPE "ScheduleKind";

ALTER TABLE "MenuItem" ALTER COLUMN "station" DROP DEFAULT;
ALTER TABLE "MenuItem" ALTER COLUMN "station" TYPE TEXT USING "station"::TEXT;
ALTER TABLE "OrderLine" ALTER COLUMN "station" TYPE TEXT USING "station"::TEXT;
DROP TYPE "Station";

-- Stock locations keep a behavioural kind only: main warehouse, mobile (van, car) or point of use (kitchen, bar, ward).
CREATE TYPE "StockLocationKind_new" AS ENUM ('WAREHOUSE', 'MOBILE', 'POINT');
ALTER TABLE "StockLocation" ALTER COLUMN "kind" TYPE "StockLocationKind_new" USING (
  CASE "kind"::TEXT WHEN 'VAN' THEN 'MOBILE' WHEN 'KITCHEN' THEN 'POINT' WHEN 'BAR' THEN 'POINT' ELSE 'WAREHOUSE' END
)::"StockLocationKind_new";
DROP TYPE "StockLocationKind";
ALTER TYPE "StockLocationKind_new" RENAME TO "StockLocationKind";

-- Every module is on sale to every shop; the category only decides what is free and what is recommended.
ALTER TABLE "ModuleDef" ADD COLUMN "requires" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CategoryModule" ADD COLUMN "recommended" BOOLEAN;
ALTER TABLE "Tenant" ADD COLUMN "needs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "Need" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'checkmark-circle-outline',
    "modules" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Need_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Need_key_key" ON "Need"("key");
CREATE INDEX "Need_categoryId_idx" ON "Need"("categoryId");
ALTER TABLE "Need" ADD CONSTRAINT "Need_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "ModuleDef" SET "requires" = ARRAY['menu'] WHERE "key" IN ('orders', 'inventory');
UPDATE "ModuleDef" SET "requires" = ARRAY['orders'] WHERE "key" = 'floor';
UPDATE "ModuleDef" SET "description" = 'Magazzino e mezzi', "pitch" = 'Giacenze di magazzino e sui mezzi.' WHERE "key" = 'stock';
UPDATE "ModuleDef" SET "pitch" = 'Controlli guidati passo per passo.' WHERE "key" = 'checklists';

INSERT INTO "Need" ("id", "key", "categoryId", "label", "description", "icon", "modules", "sortOrder", "updatedAt") VALUES
  ('need_reports',    'reports',    'cat_field_service', 'Fare rapportini con foto e firma', 'Il cliente firma sul telefono, il PDF parte da solo.', 'document-text-outline', ARRAY['work_orders'], 0, CURRENT_TIMESTAMP),
  ('need_installed',  'installed',  'cat_field_service', 'Sapere cosa ho installato e dove', 'Schede impianto con matricola e storico.',           'hardware-chip-outline', ARRAY['assets'], 1, CURRENT_TIMESTAMP),
  ('need_parts',      'parts',      'cat_field_service', 'Trovare subito il ricambio giusto', 'Codici, modelli compatibili e scansione.',          'barcode-outline',       ARRAY['spare_parts', 'stock'], 2, CURRENT_TIMESTAMP),
  ('need_tables',     'tables',     'cat_hospitality',   'Servire ai tavoli',                 'Sala, comande e menu sul telefono.',                'restaurant-outline',    ARRAY['floor', 'orders', 'menu'], 0, CURRENT_TIMESTAMP),
  ('need_food_cost',  'food_cost',  'cat_hospitality',   'Sapere quanto mi costa ogni piatto', 'Ricette che scaricano il magazzino da sole.',       'calculator-outline',    ARRAY['inventory', 'suppliers'], 1, CURRENT_TIMESTAMP),
  ('need_haccp',      'haccp',      'cat_hospitality',   'Registrare i controlli HACCP',      'Checklist e promemoria per le verifiche.',          'thermometer-outline',   ARRAY['checklists', 'calendar'], 2, CURRENT_TIMESTAMP),
  ('need_deadlines',  'deadlines',  NULL,                'Non dimenticare scadenze e manutenzioni', 'Promemoria automatici sul telefono.',         'alarm-outline',         ARRAY['calendar'], 10, CURRENT_TIMESTAMP),
  ('need_customers',  'customers',  NULL,                'Avere lo storico di ogni cliente',  'Contatti, lavori e note in un posto solo.',         'people-outline',        ARRAY['customers'], 11, CURRENT_TIMESTAMP),
  ('need_stock',      'stock',      'cat_field_service', 'Controllare magazzino e furgoni',   'Giacenze sempre aggiornate, anche sui mezzi.',      'cube-outline',          ARRAY['stock'], 3, CURRENT_TIMESTAMP),
  ('need_checks',     'checks',     NULL,                'Seguire procedure e controlli',     'Checklist guidate, uguali per tutti.',              'checkbox-outline',      ARRAY['checklists'], 13, CURRENT_TIMESTAMP),
  ('need_equipment',  'equipment',  NULL,                'Tenere in ordine macchine e attrezzature', 'Schede, guasti e manutenzioni.',             'construct-outline',     ARRAY['assets', 'work_orders'], 14, CURRENT_TIMESTAMP),
  ('need_team',       'team',       NULL,                'Organizzare i turni del personale', 'Chi lavora e quando, in un tocco.',                 'time-outline',          ARRAY['shifts'], 15, CURRENT_TIMESTAMP),
  ('need_suppliers',  'suppliers',  NULL,                'Ordinare ai fornitori',             'Ordini e ricezione merce.',                         'cart-outline',          ARRAY['suppliers'], 16, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Needs of categories that no longer exist would break the foreign key.
DELETE FROM "Need" n WHERE n."categoryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = n."categoryId");

-- The login carousel shows the root categories.
UPDATE "Category" SET "image" = 'asset:stove' WHERE "id" = 'cat_field_service' AND "image" IS NULL;

-- Presets that used to live in code.
UPDATE "Category" SET
  "terminology" = "terminology" || '{"vehicle":"Furgone","warehouse":"Magazzino"}'::jsonb,
  "presets" = "presets" || '{
    "scheduleKinds": [{"key":"GENERIC","label":"Manutenzione"}],
    "dashboard": ["openWorkOrders","lowStock"],
    "sample": {
      "customer": {"name":"Mario Rossi","phone":"3331234567","city":"Brescia","address":"Via Roma 12"},
      "stockLocations": [{"name":"Magazzino","kind":"WAREHOUSE"},{"name":"Furgone","kind":"MOBILE"}],
      "asset": {"name":"Impianto principale","type":"Impianto"},
      "workOrder": "Primo intervento",
      "schedule": {"title":"Manutenzione Rossi","kind":"GENERIC","intervalMonths":12,"dueInDays":1}
    }
  }'::jsonb
WHERE "id" = 'cat_field_service';

UPDATE "Category" SET "presets" = jsonb_set(
  jsonb_set("presets" || '{"scheduleKinds":[{"key":"ANNUAL_CLEANING","label":"Pulizia annuale"}]}'::jsonb,
    '{sample,schedule}', '{"title":"Pulizia annuale Rossi","kind":"ANNUAL_CLEANING","intervalMonths":12,"dueInDays":1}'::jsonb),
  '{sample,parts,0,stock}', '[{"location":"Magazzino","quantity":6},{"location":"Furgone","quantity":2}]'::jsonb)
WHERE "id" = 'cat_stoves';

UPDATE "Category" SET "presets" = jsonb_set(
  jsonb_set("presets" || '{"scheduleKinds":[{"key":"FLUE_CHECK","label":"Controllo fumi"}]}'::jsonb,
    '{sample,schedule}', '{"title":"Controllo fumi Rossi","kind":"FLUE_CHECK","intervalMonths":12,"dueInDays":1}'::jsonb),
  '{sample,parts,0,stock}', '[{"location":"Magazzino","quantity":6},{"location":"Furgone","quantity":2}]'::jsonb)
WHERE "id" = 'cat_boilers';

UPDATE "Category" SET "presets" = jsonb_set(
  jsonb_set("presets",
    '{sample,schedule}', '{"title":"Sanificazione Rossi","kind":"GENERIC","intervalMonths":12,"dueInDays":1}'::jsonb),
  '{sample,parts,0,stock}', '[{"location":"Magazzino","quantity":6},{"location":"Furgone","quantity":2}]'::jsonb)
WHERE "id" = 'cat_hvac';

UPDATE "Category" SET
  "terminology" = "terminology" || '{"warehouse":"Dispensa"}'::jsonb,
  "presets" = "presets" || '{
    "scheduleKinds": [{"key":"HACCP","label":"HACCP","tone":"warning"},{"key":"GENERIC","label":"Manutenzione"}],
    "stations": [{"key":"KITCHEN","label":"Cucina"},{"key":"BAR","label":"Bar"},{"key":"OTHER","label":"Altro"}],
    "dashboard": ["openOrders","openWorkOrders"],
    "sample": {
      "tables": [
        {"name":"T1","posX":0.12,"posY":0.18,"seats":2},
        {"name":"T2","posX":0.4,"posY":0.18,"seats":2},
        {"name":"T3","posX":0.68,"posY":0.18,"seats":4},
        {"name":"T4","posX":0.12,"posY":0.55,"seats":4},
        {"name":"T5","posX":0.42,"posY":0.55,"seats":4},
        {"name":"Banco","posX":0.72,"posY":0.62,"seats":6}
      ],
      "modifiers": [{"name":"Senza cipolla","priceDelta":0},{"name":"Doppio espresso","priceDelta":0.5}],
      "stockLocations": [{"name":"Cucina","kind":"POINT"},{"name":"Bar","kind":"POINT"}],
      "ingredients": [
        {"name":"Uova","unit":"pz","sku":"UOV","stock":[{"location":"Cucina","quantity":40}]},
        {"name":"Guanciale","unit":"kg","sku":"GUA","stock":[{"location":"Cucina","quantity":3.5}]},
        {"name":"Pecorino","unit":"kg","sku":"PEC","stock":[{"location":"Cucina","quantity":1.2}]}
      ],
      "menu": [
        {"name":"Espresso","category":"Caffetteria","station":"BAR","price":1.3,"modifiers":["Doppio espresso"]},
        {"name":"Spritz","category":"Bar","station":"BAR","price":5},
        {"name":"Carbonara","category":"Cucina","station":"KITCHEN","price":13,"modifiers":["Senza cipolla"],
         "recipe":[{"ingredient":"Uova","quantity":2},{"ingredient":"Guanciale","quantity":0.08},{"ingredient":"Pecorino","quantity":0.04}]},
        {"name":"Tiramisù","category":"Dessert","station":"KITCHEN","price":6}
      ],
      "suppliers": [
        {"name":"Caseificio del lago","phone":"030998877","email":"ordini@caseificio.example",
         "order":[{"ingredient":"Pecorino","description":"Pecorino romano","quantity":2,"unitPrice":18}]}
      ],
      "assets": [{"name":"Macchina caffè","type":"Macchina caffè","brand":"La Marzocco","model":"Linea Mini","serialNumber":"LM-4412"}],
      "schedule": {"title":"Controllo temperature","kind":"HACCP","intervalMonths":1,"dueInDays":0},
      "shift": {"roleLabel":"Sala","start":"11:00","end":"15:00"},
      "order": {"table":"T1","covers":2,"lines":[{"item":"Espresso","quantity":2,"status":"SENT"}]}
    }
  }'::jsonb
WHERE "id" = 'cat_hospitality';

UPDATE "Category" SET "presets" = "presets" || '{"stations":[{"key":"BAR","label":"Banco"},{"key":"KITCHEN","label":"Cucina"},{"key":"OTHER","label":"Altro"}]}'::jsonb
WHERE "id" = 'cat_bar';
