-- Each category now sells only the modules its branch lists: modules missing here disappear from the shop.

-- Stock moves spare parts between warehouse and vans: it is useless without the parts catalog.
UPDATE "ModuleDef" SET "requires" = ARRAY['spare_parts'], "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'stock';

-- Field service keeps suppliers and team shifts, offered but not pushed.
INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "recommended", "updatedAt") VALUES
  ('cm_fs_suppliers', 'cat_field_service', 'suppliers', true, false, CURRENT_TIMESTAMP),
  ('cm_fs_shifts',    'cat_field_service', 'shifts',    true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("categoryId", "moduleKey") DO UPDATE SET
  "included" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Wellness shops track products with inventory; stock needs the spare parts they don't sell.
INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "recommended", "free", "tab", "sortOrder", "updatedAt") VALUES
  ('cm_wb_stock', 'cat_wellness', 'stock', false, false, false, false, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("categoryId", "moduleKey") DO UPDATE SET
  "included" = false,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Need" SET "modules" = ARRAY['inventory'], "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'wb_products';
