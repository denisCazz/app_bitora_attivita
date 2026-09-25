-- Wellness shops: nails, hair, spa. The parent is the "Altro" choice in onboarding.
INSERT INTO "Category" ("id", "key", "parentId", "label", "description", "icon", "accent", "image", "terminology", "presets", "sortOrder", "updatedAt") VALUES
  ('cat_wellness', 'wellness', NULL, 'Centri benessere',
   'Agenda, clienti, listino e prodotti per chi cura le persone.', 'sparkles-outline', '#C45C7A', NULL,
   '{"workOrder":"Trattamento","workOrders":"Trattamenti","asset":"Attrezzatura","assets":"Attrezzature","customer":"Cliente","customers":"Clienti","sparePart":"Prodotto","spareParts":"Prodotti","warehouse":"Scaffale","vehicle":"Mezzo"}',
   $wellness${
     "assetTypes": ["Poltrona", "Cabina", "Attrezzatura"],
     "customFields": [
       {"entity": "CUSTOMER", "key": "allergies", "label": "Allergie", "type": "TEXT"},
       {"entity": "CUSTOMER", "key": "preferences", "label": "Preferenze", "type": "TEXT"}
     ],
     "checklists": [{
       "name": "Apertura salone",
       "kind": "HYGIENE",
       "items": [
         {"id": "stations", "label": "Postazioni pulite"},
         {"id": "tools", "label": "Strumenti sterilizzati"},
         {"id": "linen", "label": "Biancheria pulita pronta"}
       ]
     }],
     "scheduleKinds": [
       {"key": "APPOINTMENT", "label": "Appuntamento", "tone": "accent"},
       {"key": "REMINDER", "label": "Promemoria"},
       {"key": "HYGIENE", "label": "Igiene", "tone": "warning"}
     ],
     "stations": [
       {"key": "CHAIR", "label": "Postazione"},
       {"key": "OTHER", "label": "Altro"}
     ],
     "dashboard": ["openWorkOrders"],
     "sample": {
       "customer": {"name": "Giulia Bianchi", "phone": "3471122334", "city": "Brescia", "address": "Via Milano 8"},
       "stockLocations": [
         {"name": "Scaffale", "kind": "WAREHOUSE"},
         {"name": "Banco", "kind": "POINT"}
       ],
       "assets": [{"name": "Postazione 1", "type": "Poltrona"}],
       "modifiers": [{"name": "Extra 15 minuti", "priceDelta": 10}],
       "menu": [{"name": "Consulenza", "category": "Servizi", "station": "CHAIR", "price": 0, "modifiers": ["Extra 15 minuti"]}],
       "workOrder": "Trattamento di prova",
       "schedule": {"title": "Appuntamento Bianchi", "kind": "APPOINTMENT", "intervalMonths": 1, "dueInDays": 1},
       "shift": {"roleLabel": "Operatore", "start": "09:00", "end": "18:00"}
     }
   }$wellness$::jsonb,
   2, CURRENT_TIMESTAMP),
  ('cat_nails', 'nails', 'cat_wellness', 'Unghie',
   'Semipermanente, ricostruzione, pedicure e sterilizzazione.', 'color-wand-outline', '#DB2777', NULL,
   '{"asset":"Postazione","assets":"Postazioni"}',
   $nails${
     "assetTypes": ["Postazione unghie", "Lampada UV", "Autoclave", "Poltrona pedicure"],
     "customFields": [{
       "entity": "CUSTOMER", "key": "nail_shape", "label": "Forma unghia", "type": "SELECT",
       "options": ["Mandorla", "Quadrata", "Ovale", "Stiletto", "Ballerina"]
     }],
     "checklists": [{
       "name": "Sterilizzazione",
       "kind": "HYGIENE",
       "items": [
         {"id": "autoclave", "label": "Autoclave avviata"},
         {"id": "bits", "label": "Fresa e punte sterilizzate"},
         {"id": "file", "label": "Lima monouso nuova"}
       ]
     }],
     "scheduleKinds": [{"key": "REFILL", "label": "Rifacimento", "tone": "accent"}],
     "stations": [{"key": "NAILS", "label": "Unghie"}],
     "sample": {
       "assets": [
         {"name": "Postazione 1", "type": "Postazione unghie"},
         {"name": "Lampada UV", "type": "Lampada UV", "brand": "Sun", "model": "X9"}
       ],
       "ingredients": [
         {"name": "Semipermanente", "unit": "pz", "sku": "SEMI", "stock": [{"location": "Scaffale", "quantity": 24}]},
         {"name": "Tips", "unit": "pz", "sku": "TIPS", "stock": [{"location": "Banco", "quantity": 100}]},
         {"name": "Acetone", "unit": "ml", "sku": "ACE", "stock": [{"location": "Scaffale", "quantity": 500}]}
       ],
       "modifiers": [{"name": "French", "priceDelta": 5}, {"name": "Nail art", "priceDelta": 8}],
       "menu": [
         {"name": "Semipermanente", "category": "Mani", "station": "NAILS", "price": 35, "modifiers": ["French", "Nail art"], "recipe": [{"ingredient": "Semipermanente", "quantity": 1}]},
         {"name": "Ricostruzione", "category": "Mani", "station": "NAILS", "price": 50, "recipe": [{"ingredient": "Tips", "quantity": 10}]},
         {"name": "Pedicure estetico", "category": "Piedi", "station": "NAILS", "price": 30}
       ],
       "suppliers": [{
         "name": "Color Studio", "phone": "030445566", "email": "ordini@colorstudio.example",
         "order": [{"ingredient": "Semipermanente", "description": "Smalti semipermanenti", "quantity": 6, "unitPrice": 9.5}]
       }],
       "workOrder": "Semipermanente Bianchi",
       "schedule": {"title": "Rifacimento Bianchi", "kind": "REFILL", "intervalMonths": 1, "dueInDays": 21}
     }
   }$nails$::jsonb,
   0, CURRENT_TIMESTAMP),
  ('cat_hair', 'hair', 'cat_wellness', 'Parrucchieri',
   'Taglio, colore, piega e formule in scheda cliente.', 'cut-outline', '#6D28D9', NULL,
   '{"asset":"Poltrona","assets":"Poltrone"}',
   $hair${
     "assetTypes": ["Poltrona", "Lavaggio", "Casco"],
     "customFields": [{"entity": "CUSTOMER", "key": "hair_base", "label": "Base colore", "type": "TEXT"}],
     "scheduleKinds": [{"key": "COLOR", "label": "Ritocco colore", "tone": "accent"}],
     "stations": [{"key": "SALON", "label": "Salone"}],
     "sample": {
       "assets": [
         {"name": "Poltrona 1", "type": "Poltrona"},
         {"name": "Lavaggio", "type": "Lavaggio"}
       ],
       "ingredients": [
         {"name": "Colore", "unit": "ml", "sku": "COL", "stock": [{"location": "Scaffale", "quantity": 400}]},
         {"name": "Ossigeno", "unit": "ml", "sku": "OXI", "stock": [{"location": "Scaffale", "quantity": 1000}]},
         {"name": "Shampoo", "unit": "ml", "sku": "SHA", "stock": [{"location": "Banco", "quantity": 750}]}
       ],
       "modifiers": [{"name": "Taglio punte", "priceDelta": 8}],
       "menu": [
         {"name": "Taglio donna", "category": "Taglio", "station": "SALON", "price": 32},
         {"name": "Colore", "category": "Colore", "station": "SALON", "price": 55, "modifiers": ["Taglio punte"], "recipe": [{"ingredient": "Colore", "quantity": 60}, {"ingredient": "Ossigeno", "quantity": 90}]},
         {"name": "Piega", "category": "Styling", "station": "SALON", "price": 22, "recipe": [{"ingredient": "Shampoo", "quantity": 15}]}
       ],
       "workOrder": "Colore Bianchi",
       "schedule": {"title": "Ritocco Bianchi", "kind": "COLOR", "intervalMonths": 1, "dueInDays": 28}
     }
   }$hair$::jsonb,
   1, CURRENT_TIMESTAMP),
  ('cat_spa', 'spa', 'cat_wellness', 'Spa e centri estetici',
   'Cabine, massaggi, trattamenti viso e sanificazione.', 'flower-outline', '#0F766E', NULL,
   '{"asset":"Cabina","assets":"Cabine"}',
   $spa${
     "assetTypes": ["Cabina", "Lettino", "Sauna"],
     "customFields": [{
       "entity": "CUSTOMER", "key": "skin_type", "label": "Tipo di pelle", "type": "SELECT",
       "options": ["Secca", "Normale", "Mista", "Grassa", "Sensibile"]
     }],
     "checklists": [{
       "name": "Sanificazione cabina",
       "kind": "HYGIENE",
       "items": [
         {"id": "linen", "label": "Biancheria cambiata"},
         {"id": "bed", "label": "Lettino sanificato"},
         {"id": "oils", "label": "Oli e creme controllati"}
       ]
     }],
     "scheduleKinds": [{"key": "TREATMENT", "label": "Trattamento", "tone": "accent"}],
     "stations": [{"key": "CABIN", "label": "Cabina"}],
     "sample": {
       "assets": [
         {"name": "Cabina 1", "type": "Cabina"},
         {"name": "Lettino caldo", "type": "Lettino"}
       ],
       "ingredients": [
         {"name": "Olio massaggio", "unit": "ml", "sku": "OIL", "stock": [{"location": "Scaffale", "quantity": 500}]},
         {"name": "Crema viso", "unit": "ml", "sku": "CRE", "stock": [{"location": "Banco", "quantity": 200}]}
       ],
       "modifiers": [{"name": "Pietre calde", "priceDelta": 15}],
       "menu": [
         {"name": "Massaggio 60 min", "category": "Corpo", "station": "CABIN", "price": 70, "modifiers": ["Pietre calde"], "recipe": [{"ingredient": "Olio massaggio", "quantity": 20}]},
         {"name": "Pulizia viso", "category": "Viso", "station": "CABIN", "price": 55, "recipe": [{"ingredient": "Crema viso", "quantity": 10}]},
         {"name": "Sauna", "category": "Percorso", "station": "CABIN", "price": 20}
       ],
       "workOrder": "Massaggio Bianchi",
       "schedule": {"title": "Trattamento Bianchi", "kind": "TREATMENT", "intervalMonths": 1, "dueInDays": 7}
     }
   }$spa$::jsonb,
   2, CURRENT_TIMESTAMP);

INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "recommended", "free", "tab", "sortOrder", "label", "description", "updatedAt") VALUES
  ('cm_wb_dashboard',   'cat_wellness', 'dashboard',   true, true, true,  true,  0,  'Home',         'La giornata in salone.',                         CURRENT_TIMESTAMP),
  ('cm_wb_calendar',    'cat_wellness', 'calendar',    true, true, true,  true,  1,  'Agenda',       'Appuntamenti e promemoria.',                     CURRENT_TIMESTAMP),
  ('cm_wb_customers',   'cat_wellness', 'customers',   true, true, true,  true,  2,  'Clienti',      'Schede, allergie e storico.',                    CURRENT_TIMESTAMP),
  ('cm_wb_work_orders', 'cat_wellness', 'work_orders', true, true, true,  true,  3,  'Trattamenti',  'Note e foto di quello che hai fatto.',           CURRENT_TIMESTAMP),
  ('cm_wb_menu',        'cat_wellness', 'menu',        true, true, false, false, 4,  'Listino',      'Servizi e prezzi.',                              CURRENT_TIMESTAMP),
  ('cm_wb_shifts',      'cat_wellness', 'shifts',      true, true, false, false, 5,  'Turni',        'Chi è in salone e quando.',                      CURRENT_TIMESTAMP),
  ('cm_wb_stock',       'cat_wellness', 'stock',       true, true, false, false, 6,  'Prodotti',     'Smalti, colori e prodotti in negozio.',          CURRENT_TIMESTAMP),
  ('cm_wb_inventory',   'cat_wellness', 'inventory',   true, true, false, false, 7,  'Consumi',      'Scarico di colori e materiali per servizio.',    CURRENT_TIMESTAMP),
  ('cm_wb_checklists',  'cat_wellness', 'checklists',  true, true, false, false, 8,  'Igiene',       'Sterilizzazione e apertura.',                    CURRENT_TIMESTAMP),
  ('cm_wb_assets',      'cat_wellness', 'assets',      true, true, false, false, 9,  'Attrezzature', 'Poltrone, lampade e cabine.',                    CURRENT_TIMESTAMP),
  ('cm_wb_suppliers',   'cat_wellness', 'suppliers',   true, true, false, false, 10, 'Fornitori',    'Ordini di prodotti e materiali.',                CURRENT_TIMESTAMP),
  ('cm_wb_settings',    'cat_wellness', 'settings',    true, true, true,  false, 99, NULL,           NULL,                                             CURRENT_TIMESTAMP),
  ('cm_na_assets',      'cat_nails',    'assets',      true, NULL, NULL,  NULL,  NULL, 'Postazioni', NULL,                                             CURRENT_TIMESTAMP),
  ('cm_ha_assets',      'cat_hair',     'assets',      true, NULL, NULL,  NULL,  NULL, 'Poltrone',   NULL,                                             CURRENT_TIMESTAMP),
  ('cm_sp_assets',      'cat_spa',      'assets',      true, NULL, NULL,  NULL,  NULL, 'Cabine',     NULL,                                             CURRENT_TIMESTAMP);

INSERT INTO "CategoryRole" ("id", "categoryId", "name", "owner", "permissions", "sortOrder", "updatedAt") VALUES
  ('cr_wb_owner', 'cat_wellness', 'Titolare', true,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','spare_parts.read','spare_parts.write','stock.read','stock.adjust','floor.read','floor.write','orders.read','orders.write','orders.void','menu.read','menu.write','inventory.read','inventory.write','suppliers.read','suppliers.write','shifts.read','shifts.write','settings.manage','team.manage'],
   0, CURRENT_TIMESTAMP),
  ('cr_wb_manager', 'cat_wellness', 'Responsabile', false,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','stock.read','stock.adjust','menu.read','menu.write','inventory.read','inventory.write','suppliers.read','suppliers.write','shifts.read','shifts.write','team.manage'],
   1, CURRENT_TIMESTAMP),
  ('cr_wb_operator', 'cat_wellness', 'Operatore', false,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','work_orders.read','work_orders.write','checklists.read','schedules.read','schedules.write','menu.read','stock.read','shifts.read'],
   2, CURRENT_TIMESTAMP),
  ('cr_wb_reception', 'cat_wellness', 'Reception', false,
   ARRAY['dashboard.view','customers.read','customers.write','work_orders.read','work_orders.write','schedules.read','schedules.write','menu.read','shifts.read'],
   3, CURRENT_TIMESTAMP);

INSERT INTO "Need" ("id", "key", "categoryId", "label", "description", "icon", "modules", "sortOrder", "updatedAt") VALUES
  ('need_wb_agenda',     'wb_agenda',     'cat_wellness', 'Tenere l''agenda degli appuntamenti', 'Il telefono ricorda chi arriva e quando.',           'calendar-outline',    ARRAY['calendar'],            0, CURRENT_TIMESTAMP),
  ('need_wb_clients',    'wb_clients',    'cat_wellness', 'Avere la scheda di ogni cliente',      'Allergie, preferenze e trattamenti fatti.',          'people-outline',      ARRAY['customers'],           1, CURRENT_TIMESTAMP),
  ('need_wb_treatments', 'wb_treatments', 'cat_wellness', 'Registrare i trattamenti',             'Note e foto restano sulla scheda.',                  'sparkles-outline',    ARRAY['work_orders'],         2, CURRENT_TIMESTAMP),
  ('need_wb_prices',     'wb_prices',     'cat_wellness', 'Avere il listino sempre aggiornato',   'Servizi e prezzi sul telefono.',                     'pricetag-outline',    ARRAY['menu'],                3, CURRENT_TIMESTAMP),
  ('need_wb_products',   'wb_products',   'cat_wellness', 'Controllare prodotti e materiali',     'Giacenze di smalti, colori e oli.',                  'color-palette-outline', ARRAY['stock', 'inventory'], 4, CURRENT_TIMESTAMP),
  ('need_wb_hygiene',    'wb_hygiene',    'cat_wellness', 'Seguire igiene e sterilizzazione',     'Checklist di apertura e strumenti.',                 'medkit-outline',      ARRAY['checklists'],          5, CURRENT_TIMESTAMP);
