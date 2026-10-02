-- Every trade names its own sections: a salon has a listino, a restaurant a menu.

ALTER TABLE "CategoryModule"
  ADD COLUMN "pitch" TEXT,
  ADD COLUMN "details" TEXT,
  ADD COLUMN "features" TEXT[] DEFAULT ARRAY[]::TEXT[];

INSERT INTO "TermDef" ("key", "label", "defaultValue", "sortOrder", "updatedAt") VALUES
  ('menu', 'Menu o listino', 'Menu', 10, CURRENT_TIMESTAMP),
  ('menuItem', 'Voce del menu (singolare)', 'Voce', 11, CURRENT_TIMESTAMP),
  ('menuItems', 'Voci del menu (plurale)', 'Voci', 12, CURRENT_TIMESTAMP),
  ('modifier', 'Variante (singolare)', 'Variante', 13, CURRENT_TIMESTAMP),
  ('modifiers', 'Varianti (plurale)', 'Varianti', 14, CURRENT_TIMESTAMP),
  ('inventory', 'Scorte', 'Scorte', 15, CURRENT_TIMESTAMP),
  ('order', 'Comanda (singolare)', 'Comanda', 16, CURRENT_TIMESTAMP),
  ('orders', 'Comande (plurale)', 'Comande', 17, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "TermValue" ("id", "termKey", "categoryId", "scopeKey", "value", "updatedAt")
SELECT 'tv_c_' || md5(c."id" || v."term"), v."term", c."id", 'category:' || c."id", v."value", CURRENT_TIMESTAMP
FROM (VALUES
  ('cat_hospitality', 'menuItem', 'Piatto'),
  ('cat_hospitality', 'menuItems', 'Piatti'),
  ('cat_bar', 'menuItem', 'Prodotto'),
  ('cat_bar', 'menuItems', 'Prodotti'),
  ('cat_gelato', 'menuItem', 'Gusto'),
  ('cat_gelato', 'menuItems', 'Gusti'),
  ('cat_bakery', 'menu', 'Listino'),
  ('cat_bakery', 'menuItem', 'Prodotto'),
  ('cat_bakery', 'menuItems', 'Prodotti'),
  ('cat_wellness', 'menu', 'Listino'),
  ('cat_wellness', 'menuItem', 'Servizio'),
  ('cat_wellness', 'menuItems', 'Servizi'),
  ('cat_wellness', 'modifier', 'Extra'),
  ('cat_wellness', 'modifiers', 'Extra'),
  ('cat_wellness', 'inventory', 'Prodotti'),
  ('cat_florist', 'menuItem', 'Articolo'),
  ('cat_florist', 'menuItems', 'Articoli')
) AS v("category", "term", "value")
JOIN "Category" c ON c."id" = v."category"
ON CONFLICT ("termKey", "scopeKey") DO NOTHING;

-- Singular and plural of the same word.
UPDATE "TermValue" SET "value" = 'Manutenzione', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categoryId" = 'cat_hospitality' AND "termKey" = 'workOrder' AND "value" = 'Ticket';

-- A module named after a word takes the word: copy the names set on the category.
INSERT INTO "TermValue" ("id", "termKey", "categoryId", "scopeKey", "value", "updatedAt")
SELECT 'tv_c_' || md5(cm."categoryId" || t."term"), t."term", cm."categoryId", 'category:' || cm."categoryId", cm."label", CURRENT_TIMESTAMP
FROM "CategoryModule" cm
JOIN (VALUES
  ('work_orders', 'workOrders'),
  ('assets', 'assets'),
  ('customers', 'customers'),
  ('spare_parts', 'spareParts'),
  ('menu', 'menu'),
  ('inventory', 'inventory'),
  ('orders', 'orders')
) AS t("moduleKey", "term") ON t."moduleKey" = cm."moduleKey"
WHERE cm."label" IS NOT NULL AND length(btrim(cm."label")) >= 2
ON CONFLICT ("termKey", "scopeKey") DO NOTHING;

UPDATE "CategoryModule" SET "label" = 'Prodotti', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categoryId" = 'cat_wellness' AND "moduleKey" = 'inventory' AND "label" = 'Consumi';

UPDATE "CategoryModule" SET "description" = 'Smalti, colori e prodotti: giacenze e riordino.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categoryId" = 'cat_wellness' AND "moduleKey" = 'inventory' AND "description" = 'Scarico di colori e materiali per servizio.';

UPDATE "CategoryModule" SET "description" = 'Schede, preferenze e storico.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categoryId" = 'cat_wellness' AND "moduleKey" = 'customers' AND "description" = 'Schede, allergie e storico.';

-- Store texts for wellness: the catalog ones talk about dishes, kitchens and technicians.
UPDATE "CategoryModule" AS cm SET
  "pitch" = v."pitch",
  "details" = v."details",
  "features" = v."features",
  "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('menu',
   'Servizi ed extra con il prezzo giusto.',
   'Il listino sul telefono: servizi divisi per categoria, prezzi ed extra a sovrapprezzo. Lo aggiorni in un attimo e tutto lo staff lo vede subito.',
   ARRAY['Servizi divisi per categoria, con prezzo', 'Extra a sovrapprezzo collegati ai servizi', 'Servizi da nascondere quando non li fai', 'Listino letto dal tuo sito con l''assistente']),
  ('inventory',
   'Sai quali prodotti stanno finendo prima che finiscano.',
   'Tutti i prodotti con giacenza, scorta minima e costo. Segni carichi, consumi e scarti in un tocco, fai la conta e quello che scende sotto la scorta minima lo trovi da riordinare, già diviso per fornitore.',
   ARRAY['Giacenze con scorta minima e avvisi', 'Carichi, consumi e scarti in un tocco', 'Conta con rettifica automatica', 'Lista da riordinare divisa per fornitore']),
  ('work_orders',
   'Note e foto di ogni lavoro, sulla scheda del cliente.',
   'Registri quello che hai fatto con note e foto. La volta dopo apri la scheda del cliente e ritrovi tutto lo storico. Se serve, fai firmare il cliente sul telefono e condividi il riepilogo in PDF.',
   ARRAY['Data, stato e chi se ne occupa', 'Note e foto prima e dopo', 'Storico completo sulla scheda del cliente', 'Firma e riepilogo PDF quando servono']),
  ('assets',
   'Ogni attrezzatura con marca, modello e storico.',
   'Una scheda per poltrone, lampade, cabine e macchinari: marca, modello, matricola e foto. Sai sempre cosa hai e cosa ci hai fatto.',
   ARRAY['Schede con marca, modello e matricola', 'Foto e documenti', 'Campi personalizzati']),
  ('checklists',
   'Pulizie e sterilizzazione spuntate ogni giorno.',
   'Le liste di apertura, sterilizzazione e sanificazione sul telefono. Chi lavora spunta le voci e resta il registro di chi ha fatto cosa e quando.',
   ARRAY['Modelli di igiene e sterilizzazione', 'Compilazione guidata anche offline', 'Registro dei controlli fatti'])
) AS v("moduleKey", "pitch", "details", "features")
WHERE cm."categoryId" = 'cat_wellness' AND cm."moduleKey" = v."moduleKey" AND cm."pitch" IS NULL;

-- Laundries and florists don't sterilise: their checklists are opening checks.
INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "label", "description", "pitch", "details", "features", "updatedAt")
SELECT 'cm_' || c."key" || '_checklists', c."id", 'checklists', true, 'Controlli', 'Pulizie e controlli di apertura.',
  'Controlli di apertura e pulizia spuntati ogni giorno.',
  'Le liste di apertura, chiusura e pulizia sul telefono. Chi lavora spunta le voci e resta il registro di chi ha fatto cosa e quando.',
  ARRAY['Modelli di controllo personalizzabili', 'Compilazione guidata anche offline', 'Registro dei controlli fatti'],
  CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."id" IN ('cat_laundry', 'cat_florist')
ON CONFLICT ("categoryId", "moduleKey") DO NOTHING;

-- Catalog texts that every trade with a menu or a listino reads.
UPDATE "ModuleDef" SET
  "description" = 'Voci, varianti e prezzi',
  "pitch" = 'Prezzi e varianti sempre aggiornati.',
  "details" = 'Le tue voci sempre aggiornate: categorie, prezzi e varianti. Le modifiche arrivano subito a tutti i dispositivi.',
  "features" = ARRAY['Voci e categorie con prezzi', 'Varianti e supplementi', 'Disponibilità attivabile al volo', 'Reparto di preparazione per ogni voce'],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'menu' AND "description" = 'Piatti, varianti e prezzi';

UPDATE "PermissionDef" SET "description" = 'Vede le voci, i prezzi e cosa è disponibile', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'menu.read';
UPDATE "PermissionDef" SET "label" = 'Cambiare voci e prezzi', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'menu.write';
UPDATE "PermissionDef" SET "description" = 'Vede le quantità e cosa sta finendo', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'inventory.read';
UPDATE "PermissionDef" SET "description" = 'Aggiunge voci e aggiorna la comanda', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'orders.write';

-- Gelaterie and pasticcerie prepare in the laboratorio, not in a kitchen.
INSERT INTO "VocabItem" ("id", "listKey", "categoryId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_' || c."key" || '_kitchen', 'stations', c."id", 'category:' || c."id", 'KITCHEN', 'Laboratorio', 0, true, CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."id" IN ('cat_gelato', 'cat_bakery')
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

-- "Menu" in settings is the list of sections, not the restaurant menu.
UPDATE "NavEntry" SET "label" = 'Voci dell''app', "subtitle" = 'Cosa compare nella barra e in Altro', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'nav_set_menu' AND "label" = 'Menu';

UPDATE "VocabList" SET "label" = 'Categorie del menu o del listino', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'menu_categories' AND "label" = 'Categorie del menu';
