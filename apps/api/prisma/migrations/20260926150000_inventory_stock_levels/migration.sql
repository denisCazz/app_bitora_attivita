-- Recipes are gone: stock is loaded and unloaded by hand, with a minimum level per item.
DROP TABLE "RecipeLine";
DROP TABLE "Recipe";

ALTER TABLE "Ingredient" ADD COLUMN "category" TEXT,
ADD COLUMN "barcode" TEXT,
ADD COLUMN "minQuantity" DECIMAL(12,3),
ADD COLUMN "unitCost" DECIMAL(10,2),
ADD COLUMN "supplierId" TEXT;

CREATE INDEX "Ingredient_tenantId_barcode_idx" ON "Ingredient"("tenantId", "barcode");
CREATE INDEX "Ingredient_supplierId_idx" ON "Ingredient"("supplierId");
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The last unit price paid becomes the item cost.
UPDATE "Ingredient" AS i SET "unitCost" = l."unitPrice"
FROM (
  SELECT DISTINCT ON (pl."ingredientId") pl."ingredientId", pl."unitPrice"
  FROM "PurchaseOrderLine" pl
  WHERE pl."ingredientId" IS NOT NULL AND pl."unitPrice" > 0
  ORDER BY pl."ingredientId", pl."createdAt" DESC
) AS l
WHERE i."id" = l."ingredientId";

-- The supplier of the last order becomes the usual supplier.
UPDATE "Ingredient" AS i SET "supplierId" = l."supplierId"
FROM (
  SELECT DISTINCT ON (pl."ingredientId") pl."ingredientId", po."supplierId"
  FROM "PurchaseOrderLine" pl
  JOIN "PurchaseOrder" po ON po."id" = pl."orderId"
  WHERE pl."ingredientId" IS NOT NULL
  ORDER BY pl."ingredientId", pl."createdAt" DESC
) AS l
WHERE i."id" = l."ingredientId";

UPDATE "ModuleDef" SET "requires" = ARRAY[]::TEXT[] WHERE "key" = 'inventory';

UPDATE "ModuleDef" SET
  "description" = 'Scorte, sottoscorta e riordino',
  "pitch" = 'Sai cosa sta finendo prima che finisca.',
  "details" = 'Tutti i tuoi prodotti con giacenza, scorta minima e costo. Registri carichi, consumi e scarti in un tocco, fai la conta di inventario e quando qualcosa va sotto scorta prepari l''ordine al fornitore già compilato.',
  "features" = ARRAY['Giacenze con scorta minima e avvisi di sottoscorta', 'Carichi, consumi e scarti in un tocco', 'Conta di inventario con rettifica automatica', 'Lista da ordinare e ordini ai fornitori già compilati', 'Valore del magazzino e giorni di autonomia'],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'inventory';

UPDATE "Need" SET "label" = 'Non restare senza scorte', "description" = 'Sottoscorta, conta e ordini ai fornitori.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'food_cost';
