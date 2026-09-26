-- Accounting: a cash book of income and expenses, on sale to every activity.
CREATE TYPE "LedgerKind" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "method" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "customerId" TEXT,
    "supplierId" TEXT,
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LedgerEntry_tenantId_date_idx" ON "LedgerEntry"("tenantId", "date");
CREATE INDEX "LedgerEntry_tenantId_kind_paid_idx" ON "LedgerEntry"("tenantId", "kind", "paid");
CREATE INDEX "LedgerEntry_customerId_idx" ON "LedgerEntry"("customerId");
CREATE INDEX "LedgerEntry_supplierId_idx" ON "LedgerEntry"("supplierId");
CREATE INDEX "LedgerEntry_workOrderId_idx" ON "LedgerEntry"("workOrderId");

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ModuleDef" SET "sortOrder" = 15, "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'settings';

INSERT INTO "ModuleDef" ("key", "label", "description", "pitch", "icon", "priceCents", "sortOrder", "updatedAt") VALUES
  ('accounting', 'Contabilità', 'Entrate, uscite e prima nota', 'Entrate, uscite e saldo del mese sempre sotto controllo.', 'calculator-outline', 900, 14, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Recommended on every root activity, so every sub-activity inherits it.
INSERT INTO "CategoryModule" ("id", "categoryId", "moduleKey", "included", "recommended", "updatedAt")
SELECT 'cm_' || c."key" || '_accounting', c."id", 'accounting', true, true, CURRENT_TIMESTAMP
FROM "Category" c
WHERE c."parentId" IS NULL
ON CONFLICT ("categoryId", "moduleKey") DO UPDATE SET
  "included" = true,
  "recommended" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Need" ("id", "key", "categoryId", "label", "description", "icon", "modules", "sortOrder", "updatedAt") VALUES
  ('need_accounting', 'accounting', NULL, 'Tenere i conti in ordine', 'Entrate, uscite e cosa resta da incassare.', 'calculator-outline', ARRAY['accounting'], 17, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Owners get the new permissions; other roles are left for the owner to decide.
UPDATE "CategoryRole"
SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['accounting.read', 'accounting.write'])),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "owner" = true;

UPDATE "Role"
SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['accounting.read', 'accounting.write'])),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isSystem" = true;
