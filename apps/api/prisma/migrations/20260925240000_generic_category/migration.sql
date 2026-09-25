-- A shop that does not match a trade: the assistant fills words, fields and trials from a short description.
INSERT INTO "Category" ("id", "key", "parentId", "label", "description", "icon", "accent", "image", "terminology", "presets", "sortOrder", "updatedAt") VALUES
  ('cat_generic', 'generic', NULL, 'Altra attività',
   'Descrivi il mestiere: prepariamo parole, campi e moduli.', 'storefront-outline', '#6366F1', NULL,
   '{}',
   $generic${
     "scheduleKinds": [
       {"key": "APPOINTMENT", "label": "Appuntamento", "tone": "accent"},
       {"key": "REMINDER", "label": "Promemoria"}
     ],
     "stations": [{"key": "MAIN", "label": "Generale"}],
     "dashboard": ["openWorkOrders"],
     "sample": {
       "customer": {"name": "Cliente esempio", "phone": "3330001122", "city": "Brescia"},
       "workOrder": "Attività di prova",
       "schedule": {"title": "Promemoria", "kind": "REMINDER", "intervalMonths": 1, "dueInDays": 7}
     }
   }$generic$::jsonb,
   3, CURRENT_TIMESTAMP);

INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "recommended", "free", "tab", "sortOrder", "label", "description", "updatedAt") VALUES
  ('cm_ge_dashboard',   'cat_generic', 'dashboard',   true, true,  true,  true,  0,  'Home',    'La giornata a colpo d''occhio.', CURRENT_TIMESTAMP),
  ('cm_ge_customers',   'cat_generic', 'customers',   true, true,  true,  true,  1,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_work_orders', 'cat_generic', 'work_orders', true, false, false, true,  2,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_calendar',    'cat_generic', 'calendar',    true, false, false, true,  3,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_orders',      'cat_generic', 'orders',      true, false, false, true,  4,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_floor',       'cat_generic', 'floor',       true, false, false, true,  5,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_menu',        'cat_generic', 'menu',        true, false, false, true,  6,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_assets',      'cat_generic', 'assets',      true, false, false, false, 7,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_spare_parts', 'cat_generic', 'spare_parts', true, false, false, false, 8,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_stock',       'cat_generic', 'stock',       true, false, false, false, 9,  NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_checklists',  'cat_generic', 'checklists',  true, false, false, false, 10, NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_inventory',   'cat_generic', 'inventory',   true, false, false, false, 11, NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_suppliers',   'cat_generic', 'suppliers',   true, false, false, false, 12, NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_shifts',      'cat_generic', 'shifts',      true, false, false, false, 13, NULL,      NULL,                             CURRENT_TIMESTAMP),
  ('cm_ge_settings',    'cat_generic', 'settings',    true, true,  true,  false, 99, NULL,      NULL,                             CURRENT_TIMESTAMP);

INSERT INTO "CategoryRole" ("id", "categoryId", "name", "owner", "permissions", "sortOrder", "updatedAt") VALUES
  ('cr_ge_owner', 'cat_generic', 'Titolare', true,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','work_orders.assign','checklists.read','checklists.manage','schedules.read','schedules.write','spare_parts.read','spare_parts.write','stock.read','stock.adjust','floor.read','floor.write','orders.read','orders.write','orders.void','menu.read','menu.write','inventory.read','inventory.write','suppliers.read','suppliers.write','shifts.read','shifts.write','settings.manage','team.manage'],
   0, CURRENT_TIMESTAMP),
  ('cr_ge_staff', 'cat_generic', 'Collaboratore', false,
   ARRAY['dashboard.view','customers.read','customers.write','assets.read','assets.write','work_orders.read','work_orders.write','checklists.read','schedules.read','schedules.write','spare_parts.read','stock.read','floor.read','orders.read','orders.write','menu.read','inventory.read','shifts.read'],
   1, CURRENT_TIMESTAMP);
