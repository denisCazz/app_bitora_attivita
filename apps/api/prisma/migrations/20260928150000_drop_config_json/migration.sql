-- The JSON blobs were copied into the config tables by the previous migration.

ALTER TABLE "CustomFieldDef" DROP CONSTRAINT "CustomFieldDef_tenantId_fkey";

ALTER TABLE "Asset" DROP COLUMN "customFields";
ALTER TABLE "Category" DROP COLUMN "presets", DROP COLUMN "terminology";
ALTER TABLE "ChecklistRun" DROP COLUMN "answers";
ALTER TABLE "ChecklistTemplate" DROP COLUMN "items";
ALTER TABLE "Customer" DROP COLUMN "customFields";
ALTER TABLE "MenuItem" DROP COLUMN "customFields";
ALTER TABLE "Tenant" DROP COLUMN "branding", DROP COLUMN "settings";
ALTER TABLE "TenantModule" DROP COLUMN "config";
ALTER TABLE "WorkOrder" DROP COLUMN "customFields";

DROP TABLE "CustomFieldDef";
DROP TYPE "CustomFieldEntity";
DROP TYPE "CustomFieldType";
