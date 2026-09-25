-- Wellness shops sell their own listino, products and hygiene.
-- Sala, comande and ricambi belong to restaurants and field service.
INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "recommended", "free", "tab", "sortOrder", "updatedAt") VALUES
  ('cm_wb_floor',       'cat_wellness', 'floor',       false, false, false, false, NULL, CURRENT_TIMESTAMP),
  ('cm_wb_orders',      'cat_wellness', 'orders',      false, false, false, false, NULL, CURRENT_TIMESTAMP),
  ('cm_wb_spare_parts', 'cat_wellness', 'spare_parts', false, false, false, false, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("categoryId", "moduleKey") DO UPDATE SET
  "included" = false,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "CategoryRole"
SET
  "permissions" = ARRAY(
    SELECT permission
    FROM unnest("permissions") AS permission
    WHERE permission NOT IN (
      'spare_parts.read', 'spare_parts.write',
      'floor.read', 'floor.write',
      'orders.read', 'orders.write', 'orders.void'
    )
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "categoryId" = 'cat_wellness';

UPDATE "Role" AS role
SET
  "permissions" = ARRAY(
    SELECT permission
    FROM unnest(role."permissions") AS permission
    WHERE permission NOT IN (
      'spare_parts.read', 'spare_parts.write',
      'floor.read', 'floor.write',
      'orders.read', 'orders.write', 'orders.void'
    )
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
JOIN "Category" AS category ON category."id" = tenant."categoryId"
WHERE role."tenantId" = tenant."id"
  AND (category."id" = 'cat_wellness' OR category."parentId" = 'cat_wellness');
