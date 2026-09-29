-- CreateEnum
CREATE TYPE "ModuleKind" AS ENUM ('NATIVE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'MONEY', 'DATE', 'DATETIME', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'PHOTO', 'REFERENCE', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "NavPlacement" AS ENUM ('TAB', 'MORE', 'SETTINGS', 'HOME_ACTIONS');

-- CreateEnum
CREATE TYPE "NavKind" AS ENUM ('MODULE', 'ROUTE', 'GROUP', 'LINK');


ALTER TABLE "ModuleDef" ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "kind" "ModuleKind" NOT NULL DEFAULT 'NATIVE',
ADD COLUMN     "readPermission" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "route" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "writePermission" TEXT;


-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "accent" TEXT,
ADD COLUMN "activity" TEXT,
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "menuSourceUrl" TEXT;

-- CreateTable
CREATE TABLE "EntityDef" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelPlural" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'apps-outline',
    "native" BOOLEAN NOT NULL DEFAULT false,
    "titleFieldKey" TEXT NOT NULL DEFAULT 'name',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityDef_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FieldDef" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "categoryId" TEXT,
    "tenantId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "type" "FieldType",
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN,
    "visible" BOOLEAN,
    "sortOrder" INTEGER,
    "section" TEXT,
    "showInList" BOOLEAN,
    "refEntityId" TEXT,
    "placeholder" TEXT,
    "help" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "textValue" TEXT NOT NULL DEFAULT '',
    "numberValue" DECIMAL(14,4),
    "dateValue" TIMESTAMP(3),
    "boolValue" BOOLEAN,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermDef" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermDef_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TermValue" (
    "id" TEXT NOT NULL,
    "termKey" TEXT NOT NULL,
    "categoryId" TEXT,
    "tenantId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabList" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "replace" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabList_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "VocabItem" (
    "id" TEXT NOT NULL,
    "listKey" TEXT NOT NULL,
    "categoryId" TEXT,
    "tenantId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tone" TEXT,
    "minutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavEntry" (
    "id" TEXT NOT NULL,
    "placement" "NavPlacement" NOT NULL,
    "categoryId" TEXT,
    "tenantId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "parentKey" TEXT,
    "kind" "NavKind" NOT NULL,
    "moduleKey" TEXT,
    "route" TEXT,
    "label" TEXT,
    "icon" TEXT,
    "subtitle" TEXT,
    "permission" TEXT,
    "sortOrder" INTEGER,
    "visible" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistPreset" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERIC',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistPresetItem" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistPresetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistAnswer" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleRecord" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleValue" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "textValue" TEXT NOT NULL DEFAULT '',
    "numberValue" DECIMAL(14,4),
    "boolValue" BOOLEAN,
    "refSample" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SampleValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPaymentSettings" (
    "tenantId" TEXT NOT NULL,
    "provider" TEXT,
    "revolut" TEXT,
    "satispay" TEXT,
    "stripeSecretKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPaymentSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "TenantReminderSettings" (
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "daysBefore" INTEGER NOT NULL DEFAULT 30,
    "autoEmail" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantReminderSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "intValue" INTEGER,
    "textValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "FieldDef_entityId_idx" ON "FieldDef"("entityId");

-- CreateIndex
CREATE INDEX "FieldDef_categoryId_idx" ON "FieldDef"("categoryId");

-- CreateIndex
CREATE INDEX "FieldDef_tenantId_idx" ON "FieldDef"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDef_entityId_key_scopeKey_key" ON "FieldDef"("entityId", "key", "scopeKey");

-- CreateIndex
CREATE INDEX "FieldOption_fieldId_idx" ON "FieldOption"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldOption_fieldId_value_key" ON "FieldOption"("fieldId", "value");

-- CreateIndex
CREATE INDEX "FieldValue_tenantId_entityKey_fieldKey_textValue_idx" ON "FieldValue"("tenantId", "entityKey", "fieldKey", "textValue");

-- CreateIndex
CREATE INDEX "FieldValue_tenantId_entityKey_fieldKey_numberValue_idx" ON "FieldValue"("tenantId", "entityKey", "fieldKey", "numberValue");

-- CreateIndex
CREATE INDEX "FieldValue_recordId_idx" ON "FieldValue"("recordId");

-- CreateIndex
CREATE INDEX "FieldValue_refId_idx" ON "FieldValue"("refId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldValue_recordId_fieldKey_textValue_key" ON "FieldValue"("recordId", "fieldKey", "textValue");

-- CreateIndex
CREATE INDEX "EntityRecord_tenantId_entityId_idx" ON "EntityRecord"("tenantId", "entityId");

-- CreateIndex
CREATE INDEX "EntityRecord_createdById_idx" ON "EntityRecord"("createdById");

-- CreateIndex
CREATE INDEX "TermValue_categoryId_idx" ON "TermValue"("categoryId");

-- CreateIndex
CREATE INDEX "TermValue_tenantId_idx" ON "TermValue"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TermValue_termKey_scopeKey_key" ON "TermValue"("termKey", "scopeKey");

-- CreateIndex
CREATE INDEX "VocabItem_categoryId_idx" ON "VocabItem"("categoryId");

-- CreateIndex
CREATE INDEX "VocabItem_tenantId_idx" ON "VocabItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabItem_listKey_key_scopeKey_key" ON "VocabItem"("listKey", "key", "scopeKey");

-- CreateIndex
CREATE INDEX "NavEntry_categoryId_idx" ON "NavEntry"("categoryId");

-- CreateIndex
CREATE INDEX "NavEntry_tenantId_idx" ON "NavEntry"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NavEntry_placement_key_scopeKey_key" ON "NavEntry"("placement", "key", "scopeKey");

-- CreateIndex
CREATE INDEX "ChecklistPreset_categoryId_idx" ON "ChecklistPreset"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistPreset_categoryId_name_key" ON "ChecklistPreset"("categoryId", "name");

-- CreateIndex
CREATE INDEX "ChecklistPresetItem_presetId_idx" ON "ChecklistPresetItem"("presetId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistPresetItem_presetId_itemKey_key" ON "ChecklistPresetItem"("presetId", "itemKey");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_templateId_idx" ON "ChecklistTemplateItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplateItem_templateId_itemKey_key" ON "ChecklistTemplateItem"("templateId", "itemKey");

-- CreateIndex
CREATE INDEX "ChecklistAnswer_runId_idx" ON "ChecklistAnswer"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistAnswer_runId_itemKey_key" ON "ChecklistAnswer"("runId", "itemKey");

-- CreateIndex
CREATE INDEX "SampleRecord_categoryId_entityKey_idx" ON "SampleRecord"("categoryId", "entityKey");

-- CreateIndex
CREATE UNIQUE INDEX "SampleRecord_categoryId_ref_key" ON "SampleRecord"("categoryId", "ref");

-- CreateIndex
CREATE INDEX "SampleValue_sampleId_idx" ON "SampleValue"("sampleId");

-- CreateIndex
CREATE UNIQUE INDEX "SampleValue_sampleId_fieldKey_textValue_key" ON "SampleValue"("sampleId", "fieldKey", "textValue");

-- CreateIndex
CREATE INDEX "ModuleDef_entityId_idx" ON "ModuleDef"("entityId");

-- AddForeignKey
ALTER TABLE "ModuleDef" ADD CONSTRAINT "ModuleDef_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "EntityDef"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDef" ADD CONSTRAINT "FieldDef_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "EntityDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDef" ADD CONSTRAINT "FieldDef_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDef" ADD CONSTRAINT "FieldDef_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDef" ADD CONSTRAINT "FieldDef_refEntityId_fkey" FOREIGN KEY ("refEntityId") REFERENCES "EntityDef"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldOption" ADD CONSTRAINT "FieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldValue" ADD CONSTRAINT "FieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRecord" ADD CONSTRAINT "EntityRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRecord" ADD CONSTRAINT "EntityRecord_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "EntityDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRecord" ADD CONSTRAINT "EntityRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermValue" ADD CONSTRAINT "TermValue_termKey_fkey" FOREIGN KEY ("termKey") REFERENCES "TermDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermValue" ADD CONSTRAINT "TermValue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermValue" ADD CONSTRAINT "TermValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabItem" ADD CONSTRAINT "VocabItem_listKey_fkey" FOREIGN KEY ("listKey") REFERENCES "VocabList"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabItem" ADD CONSTRAINT "VocabItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabItem" ADD CONSTRAINT "VocabItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavEntry" ADD CONSTRAINT "NavEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavEntry" ADD CONSTRAINT "NavEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPreset" ADD CONSTRAINT "ChecklistPreset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPresetItem" ADD CONSTRAINT "ChecklistPresetItem_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ChecklistPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistAnswer" ADD CONSTRAINT "ChecklistAnswer_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ChecklistRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleRecord" ADD CONSTRAINT "SampleRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleValue" ADD CONSTRAINT "SampleValue_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "SampleRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPaymentSettings" ADD CONSTRAINT "TenantPaymentSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantReminderSettings" ADD CONSTRAINT "TenantReminderSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Base catalog: entities, fields, words, vocabularies, menus, permissions and platform settings.
-- Then copy Category.presets / terminology, Tenant.settings / branding, custom fields and checklists.

INSERT INTO "EntityDef" ("key", "label", "labelPlural", "icon", "native", "titleFieldKey", "updatedAt") VALUES
  ('customer', 'Cliente', 'Clienti', 'people-outline', true, 'name', CURRENT_TIMESTAMP),
  ('asset', 'Impianto', 'Impianti', 'hardware-chip-outline', true, 'name', CURRENT_TIMESTAMP),
  ('work_order', 'Intervento', 'Interventi', 'construct-outline', true, 'title', CURRENT_TIMESTAMP),
  ('menu_item', 'Voce di menu', 'Menu', 'book-outline', true, 'name', CURRENT_TIMESTAMP),
  ('product', 'Prodotto', 'Prodotti', 'cube-outline', true, 'name', CURRENT_TIMESTAMP),
  ('supplier', 'Fornitore', 'Fornitori', 'cube-outline', true, 'name', CURRENT_TIMESTAMP),
  ('ingredient', 'Ingrediente', 'Ingredienti', 'layers-outline', true, 'name', CURRENT_TIMESTAMP);

INSERT INTO "FieldDef" ("id", "entityId", "scopeKey", "key", "label", "type", "builtIn", "required", "visible", "sortOrder", "showInList", "refEntityId", "updatedAt") VALUES
  ('fd_customer_name', 'customer', 'base', 'name', 'Nome', 'TEXT', true, true, true, 0, true, NULL, CURRENT_TIMESTAMP),
  ('fd_customer_phone', 'customer', 'base', 'phone', 'Telefono', 'TEXT', true, false, true, 1, false, NULL, CURRENT_TIMESTAMP),
  ('fd_customer_email', 'customer', 'base', 'email', 'Email', 'TEXT', true, false, true, 2, false, NULL, CURRENT_TIMESTAMP),
  ('fd_customer_address', 'customer', 'base', 'address', 'Indirizzo', 'TEXT', true, false, true, 3, false, NULL, CURRENT_TIMESTAMP),
  ('fd_customer_city', 'customer', 'base', 'city', 'Città', 'TEXT', true, false, true, 4, true, NULL, CURRENT_TIMESTAMP),
  ('fd_customer_notes', 'customer', 'base', 'notes', 'Note', 'LONG_TEXT', true, false, true, 5, false, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_customer', 'asset', 'base', 'customerId', 'Cliente', 'REFERENCE', true, false, true, 0, true, 'customer', CURRENT_TIMESTAMP),
  ('fd_asset_name', 'asset', 'base', 'name', 'Nome', 'TEXT', true, true, true, 1, true, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_type', 'asset', 'base', 'type', 'Tipo', 'TEXT', true, false, true, 2, true, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_brand', 'asset', 'base', 'brand', 'Marca', 'TEXT', true, false, true, 3, false, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_model', 'asset', 'base', 'model', 'Modello', 'TEXT', true, false, true, 4, false, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_serial', 'asset', 'base', 'serialNumber', 'Matricola', 'TEXT', true, false, true, 5, false, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_installed', 'asset', 'base', 'installedAt', 'Installato il', 'DATE', true, false, true, 6, false, NULL, CURRENT_TIMESTAMP),
  ('fd_asset_notes', 'asset', 'base', 'notes', 'Note', 'LONG_TEXT', true, false, true, 7, false, NULL, CURRENT_TIMESTAMP),
  ('fd_wo_title', 'work_order', 'base', 'title', 'Titolo', 'TEXT', true, true, true, 0, true, NULL, CURRENT_TIMESTAMP),
  ('fd_wo_description', 'work_order', 'base', 'description', 'Note', 'LONG_TEXT', true, false, true, 1, false, NULL, CURRENT_TIMESTAMP),
  ('fd_wo_status', 'work_order', 'base', 'status', 'Stato', 'SELECT', true, true, true, 2, true, NULL, CURRENT_TIMESTAMP),
  ('fd_wo_when', 'work_order', 'base', 'scheduledAt', 'Quando', 'DATETIME', true, false, true, 3, true, NULL, CURRENT_TIMESTAMP),
  ('fd_wo_duration', 'work_order', 'base', 'durationMinutes', 'Durata (minuti)', 'NUMBER', true, false, true, 4, false, NULL, CURRENT_TIMESTAMP),
  ('fd_wo_customer', 'work_order', 'base', 'customerId', 'Cliente', 'REFERENCE', true, false, true, 5, true, 'customer', CURRENT_TIMESTAMP),
  ('fd_wo_asset', 'work_order', 'base', 'assetId', 'Impianto', 'REFERENCE', true, false, true, 6, true, 'asset', CURRENT_TIMESTAMP),
  ('fd_wo_assignee', 'work_order', 'base', 'assigneeId', 'Tecnico', 'TEXT', true, false, true, 7, false, NULL, CURRENT_TIMESTAMP),
  ('fd_menu_name', 'menu_item', 'base', 'name', 'Nome', 'TEXT', true, true, true, 0, true, NULL, CURRENT_TIMESTAMP),
  ('fd_menu_category', 'menu_item', 'base', 'category', 'Categoria', 'TEXT', true, true, true, 1, true, NULL, CURRENT_TIMESTAMP),
  ('fd_menu_station', 'menu_item', 'base', 'station', 'Reparto', 'TEXT', true, false, true, 2, false, NULL, CURRENT_TIMESTAMP),
  ('fd_menu_price', 'menu_item', 'base', 'price', 'Prezzo', 'MONEY', true, true, true, 3, true, NULL, CURRENT_TIMESTAMP),
  ('fd_menu_available', 'menu_item', 'base', 'available', 'Disponibile', 'BOOLEAN', true, false, true, 4, true, NULL, CURRENT_TIMESTAMP),
  ('fd_product_sku', 'product', 'base', 'sku', 'Codice', 'TEXT', true, true, true, 0, true, NULL, CURRENT_TIMESTAMP),
  ('fd_product_name', 'product', 'base', 'name', 'Nome', 'TEXT', true, true, true, 1, true, NULL, CURRENT_TIMESTAMP),
  ('fd_product_brand', 'product', 'base', 'brand', 'Marca', 'TEXT', true, false, true, 2, false, NULL, CURRENT_TIMESTAMP),
  ('fd_product_barcode', 'product', 'base', 'barcode', 'Barcode', 'TEXT', true, false, true, 3, false, NULL, CURRENT_TIMESTAMP),
  ('fd_product_price', 'product', 'base', 'unitPrice', 'Prezzo', 'MONEY', true, false, true, 4, true, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_name', 'supplier', 'base', 'name', 'Nome', 'TEXT', true, true, true, 0, true, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_vat', 'supplier', 'base', 'vat', 'Partita IVA', 'TEXT', true, false, true, 1, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_contact', 'supplier', 'base', 'contactName', 'Referente', 'TEXT', true, false, true, 2, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_email', 'supplier', 'base', 'email', 'Email', 'TEXT', true, false, true, 3, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_phone', 'supplier', 'base', 'phone', 'Telefono', 'TEXT', true, false, true, 4, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_address', 'supplier', 'base', 'address', 'Indirizzo', 'TEXT', true, false, true, 5, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_city', 'supplier', 'base', 'city', 'Città', 'TEXT', true, false, true, 6, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_terms', 'supplier', 'base', 'paymentTerms', 'Pagamento', 'TEXT', true, false, true, 7, false, NULL, CURRENT_TIMESTAMP),
  ('fd_supplier_notes', 'supplier', 'base', 'notes', 'Note', 'LONG_TEXT', true, false, true, 8, false, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_name', 'ingredient', 'base', 'name', 'Nome', 'TEXT', true, true, true, 0, true, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_unit', 'ingredient', 'base', 'unit', 'Unità', 'TEXT', true, true, true, 1, true, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_sku', 'ingredient', 'base', 'sku', 'Codice', 'TEXT', true, false, true, 2, false, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_category', 'ingredient', 'base', 'category', 'Categoria', 'TEXT', true, false, true, 3, false, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_barcode', 'ingredient', 'base', 'barcode', 'Barcode', 'TEXT', true, false, true, 4, false, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_min', 'ingredient', 'base', 'minQuantity', 'Scorta minima', 'NUMBER', true, false, true, 5, false, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_cost', 'ingredient', 'base', 'unitCost', 'Costo', 'MONEY', true, false, true, 6, false, NULL, CURRENT_TIMESTAMP),
  ('fd_ingredient_supplier', 'ingredient', 'base', 'supplierId', 'Fornitore', 'REFERENCE', true, false, true, 7, false, 'supplier', CURRENT_TIMESTAMP);

INSERT INTO "FieldOption" ("id", "fieldId", "value", "label", "sortOrder", "updatedAt") VALUES
  ('fo_wo_draft', 'fd_wo_status', 'DRAFT', 'Bozza', 0, CURRENT_TIMESTAMP),
  ('fo_wo_scheduled', 'fd_wo_status', 'SCHEDULED', 'Programmato', 1, CURRENT_TIMESTAMP),
  ('fo_wo_progress', 'fd_wo_status', 'IN_PROGRESS', 'In corso', 2, CURRENT_TIMESTAMP),
  ('fo_wo_done', 'fd_wo_status', 'DONE', 'Completato', 3, CURRENT_TIMESTAMP),
  ('fo_wo_cancelled', 'fd_wo_status', 'CANCELLED', 'Annullato', 4, CURRENT_TIMESTAMP);

INSERT INTO "TermDef" ("key", "label", "defaultValue", "sortOrder", "updatedAt") VALUES
  ('workOrder', 'Intervento (singolare)', 'Intervento', 0, CURRENT_TIMESTAMP),
  ('workOrders', 'Interventi (plurale)', 'Interventi', 1, CURRENT_TIMESTAMP),
  ('asset', 'Impianto (singolare)', 'Impianto', 2, CURRENT_TIMESTAMP),
  ('assets', 'Impianti (plurale)', 'Impianti', 3, CURRENT_TIMESTAMP),
  ('customer', 'Cliente (singolare)', 'Cliente', 4, CURRENT_TIMESTAMP),
  ('customers', 'Clienti (plurale)', 'Clienti', 5, CURRENT_TIMESTAMP),
  ('sparePart', 'Ricambio (singolare)', 'Ricambio', 6, CURRENT_TIMESTAMP),
  ('spareParts', 'Ricambi (plurale)', 'Ricambi', 7, CURRENT_TIMESTAMP),
  ('warehouse', 'Magazzino', 'Magazzino', 8, CURRENT_TIMESTAMP),
  ('vehicle', 'Mezzo', 'Mezzo', 9, CURRENT_TIMESTAMP);

INSERT INTO "VocabList" ("key", "label", "replace", "updatedAt") VALUES
  ('asset_types', 'Tipi di impianto', true, CURRENT_TIMESTAMP),
  ('schedule_kinds', 'Tipi di scadenza', false, CURRENT_TIMESTAMP),
  ('stations', 'Reparti', false, CURRENT_TIMESTAMP),
  ('ledger_income', 'Categorie entrate', true, CURRENT_TIMESTAMP),
  ('ledger_expense', 'Categorie uscite', true, CURRENT_TIMESTAMP),
  ('inventory_units', 'Unità di misura', false, CURRENT_TIMESTAMP),
  ('menu_categories', 'Categorie del menu', false, CURRENT_TIMESTAMP),
  ('dashboard_widgets', 'Numeri in home', true, CURRENT_TIMESTAMP);

INSERT INTO "VocabItem" ("id", "listKey", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt") VALUES
  ('vi_in_incassi', 'ledger_income', 'base', 'incassi', 'Incassi', 0, true, CURRENT_TIMESTAMP),
  ('vi_in_servizi', 'ledger_income', 'base', 'servizi', 'Servizi', 1, true, CURRENT_TIMESTAMP),
  ('vi_ex_fornitori', 'ledger_expense', 'base', 'fornitori', 'Fornitori', 0, true, CURRENT_TIMESTAMP),
  ('vi_ex_affitto', 'ledger_expense', 'base', 'affitto', 'Affitto', 1, true, CURRENT_TIMESTAMP),
  ('vi_ex_personale', 'ledger_expense', 'base', 'personale', 'Personale', 2, true, CURRENT_TIMESTAMP),
  ('vi_ex_utenze', 'ledger_expense', 'base', 'utenze', 'Utenze', 3, true, CURRENT_TIMESTAMP),
  ('vi_unit_pz', 'inventory_units', 'base', 'pz', 'pz', 0, true, CURRENT_TIMESTAMP),
  ('vi_unit_kg', 'inventory_units', 'base', 'kg', 'kg', 1, true, CURRENT_TIMESTAMP),
  ('vi_unit_g', 'inventory_units', 'base', 'g', 'g', 2, true, CURRENT_TIMESTAMP),
  ('vi_unit_l', 'inventory_units', 'base', 'l', 'l', 3, true, CURRENT_TIMESTAMP),
  ('vi_unit_ml', 'inventory_units', 'base', 'ml', 'ml', 4, true, CURRENT_TIMESTAMP),
  ('vi_unit_conf', 'inventory_units', 'base', 'conf', 'conf', 5, true, CURRENT_TIMESTAMP),
  ('vi_unit_bott', 'inventory_units', 'base', 'bott', 'bott', 6, true, CURRENT_TIMESTAMP);

CREATE TABLE "PermissionDef" (
    "key" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionDef_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "PermissionDef_moduleKey_idx" ON "PermissionDef"("moduleKey");

ALTER TABLE "PermissionDef" ADD CONSTRAINT "PermissionDef_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "ModuleDef"("key") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PermissionDef" ("key", "moduleKey", "section", "label", "description", "sortOrder", "updatedAt") VALUES
  ('dashboard.view', 'dashboard', 'Panoramica', 'Vedere la giornata', 'Numeri, attività e promemoria di oggi', 0, CURRENT_TIMESTAMP),
  ('customers.read', 'customers', 'Clienti', 'Solo consultare', 'Apre l''elenco e le schede, senza modificarle', 1, CURRENT_TIMESTAMP),
  ('customers.write', 'customers', 'Clienti', 'Creare e modificare', 'Aggiunge, aggiorna i dati e cancella', 2, CURRENT_TIMESTAMP),
  ('assets.read', 'assets', 'Impianti', 'Solo consultare', 'Apre schede, storico e documenti', 3, CURRENT_TIMESTAMP),
  ('assets.write', 'assets', 'Impianti', 'Creare e modificare', 'Aggiunge, aggiorna e cancella', 4, CURRENT_TIMESTAMP),
  ('work_orders.read', 'work_orders', 'Interventi', 'Solo consultare', 'Vede quelli aperti e lo storico', 5, CURRENT_TIMESTAMP),
  ('work_orders.write', 'work_orders', 'Interventi', 'Creare e chiudere', 'Apre un lavoro, lo aggiorna e lo completa', 6, CURRENT_TIMESTAMP),
  ('work_orders.assign', 'work_orders', 'Interventi', 'Assegnare a qualcuno', 'Sceglie chi se ne occupa', 7, CURRENT_TIMESTAMP),
  ('checklists.read', 'checklists', 'Checklist', 'Compilare sul campo', 'Segna le voci mentre lavora', 8, CURRENT_TIMESTAMP),
  ('checklists.manage', 'checklists', 'Checklist', 'Creare i modelli', 'Prepara e cambia le liste di controllo', 9, CURRENT_TIMESTAMP),
  ('schedules.read', 'calendar', 'Calendario', 'Solo consultare', 'Vede appuntamenti e scadenze', 10, CURRENT_TIMESTAMP),
  ('schedules.write', 'calendar', 'Calendario', 'Creare e spostare', 'Mette, cambia e cancella gli appuntamenti', 11, CURRENT_TIMESTAMP),
  ('spare_parts.read', 'spare_parts', 'Ricambi', 'Solo consultare', 'Vede codici, prezzi e su cosa si montano', 12, CURRENT_TIMESTAMP),
  ('spare_parts.write', 'spare_parts', 'Ricambi', 'Aggiornare l''elenco', 'Aggiunge articoli e cambia i dati', 13, CURRENT_TIMESTAMP),
  ('stock.read', 'stock', 'Magazzino', 'Vedere le quantità', 'Controlla quanto ce n''è', 14, CURRENT_TIMESTAMP),
  ('stock.adjust', 'stock', 'Magazzino', 'Correggere le quantità', 'Registra carichi, scarichi e rettifiche', 15, CURRENT_TIMESTAMP),
  ('floor.read', 'floor', 'Sala', 'Vedere la sala', 'Controlla tavoli e posti', 16, CURRENT_TIMESTAMP),
  ('floor.write', 'floor', 'Sala', 'Sistemare i tavoli', 'Apre, unisce e sposta', 17, CURRENT_TIMESTAMP),
  ('orders.read', 'orders', 'Ordini', 'Solo consultare', 'Vede comande e conto', 18, CURRENT_TIMESTAMP),
  ('orders.write', 'orders', 'Ordini', 'Prendere e modificare', 'Aggiunge piatti e aggiorna la comanda', 19, CURRENT_TIMESTAMP),
  ('orders.void', 'orders', 'Ordini', 'Annullare', 'Storna una comanda già inviata', 20, CURRENT_TIMESTAMP),
  ('menu.read', 'menu', 'Menu', 'Solo consultare', 'Vede piatti, prezzi e cosa è disponibile', 21, CURRENT_TIMESTAMP),
  ('menu.write', 'menu', 'Menu', 'Cambiare piatti e prezzi', 'Aggiunge, nasconde e aggiorna le voci', 22, CURRENT_TIMESTAMP),
  ('inventory.read', 'inventory', 'Scorte', 'Solo consultare', 'Vede cosa c''è in cucina e al bar', 23, CURRENT_TIMESTAMP),
  ('inventory.write', 'inventory', 'Scorte', 'Aggiornare le scorte', 'Segna entrate e uscite', 24, CURRENT_TIMESTAMP),
  ('suppliers.read', 'suppliers', 'Fornitori', 'Solo consultare', 'Vede nomi e contatti', 25, CURRENT_TIMESTAMP),
  ('suppliers.write', 'suppliers', 'Fornitori', 'Creare e modificare', 'Aggiunge fornitori e aggiorna i dati', 26, CURRENT_TIMESTAMP),
  ('shifts.read', 'shifts', 'Turni', 'Solo consultare', 'Vede chi lavora e quando', 27, CURRENT_TIMESTAMP),
  ('shifts.write', 'shifts', 'Turni', 'Organizzare i turni', 'Crea, cambia e cancella', 28, CURRENT_TIMESTAMP),
  ('accounting.read', 'accounting', 'Contabilità', 'Vedere i conti', 'Entrate, uscite e saldo del mese', 29, CURRENT_TIMESTAMP),
  ('accounting.write', 'accounting', 'Contabilità', 'Registrare movimenti', 'Aggiunge i movimenti e segna gli incassi degli interventi', 30, CURRENT_TIMESTAMP),
  ('settings.manage', 'settings', 'Impostazioni', 'Impostazioni del negozio', 'Moduli, campi, checklist, ruoli, aspetto e metodo di incasso', 31, CURRENT_TIMESTAMP),
  ('team.manage', 'settings', 'Impostazioni', 'Gestire gli utenti', 'Invita, cambia ruolo e rimuove', 32, CURRENT_TIMESTAMP);

UPDATE "ModuleDef" SET
  "kind" = 'NATIVE',
  "route" = CASE "key"
    WHEN 'dashboard' THEN '/'
    WHEN 'work_orders' THEN '/work-orders'
    WHEN 'customers' THEN '/customers'
    WHEN 'assets' THEN '/assets'
    WHEN 'calendar' THEN '/calendar'
    WHEN 'spare_parts' THEN '/parts'
    WHEN 'stock' THEN '/stock'
    WHEN 'checklists' THEN '/checklists'
    WHEN 'floor' THEN '/floor'
    WHEN 'orders' THEN '/orders'
    WHEN 'menu' THEN '/menu'
    WHEN 'inventory' THEN '/inventory'
    WHEN 'suppliers' THEN '/suppliers'
    WHEN 'shifts' THEN '/shifts'
    WHEN 'accounting' THEN '/accounting'
    WHEN 'settings' THEN '/settings'
    ELSE "route"
  END,
  "readPermission" = CASE "key"
    WHEN 'dashboard' THEN 'dashboard.view'
    WHEN 'work_orders' THEN 'work_orders.read'
    WHEN 'customers' THEN 'customers.read'
    WHEN 'assets' THEN 'assets.read'
    WHEN 'calendar' THEN 'schedules.read'
    WHEN 'spare_parts' THEN 'spare_parts.read'
    WHEN 'stock' THEN 'stock.read'
    WHEN 'checklists' THEN 'checklists.read'
    WHEN 'floor' THEN 'floor.read'
    WHEN 'orders' THEN 'orders.read'
    WHEN 'menu' THEN 'menu.read'
    WHEN 'inventory' THEN 'inventory.read'
    WHEN 'suppliers' THEN 'suppliers.read'
    WHEN 'shifts' THEN 'shifts.read'
    WHEN 'accounting' THEN 'accounting.read'
    WHEN 'settings' THEN 'settings.manage'
    ELSE "readPermission"
  END,
  "writePermission" = CASE "key"
    WHEN 'work_orders' THEN 'work_orders.write'
    WHEN 'customers' THEN 'customers.write'
    WHEN 'assets' THEN 'assets.write'
    WHEN 'calendar' THEN 'schedules.write'
    WHEN 'spare_parts' THEN 'spare_parts.write'
    WHEN 'stock' THEN 'stock.adjust'
    WHEN 'checklists' THEN 'checklists.manage'
    WHEN 'floor' THEN 'floor.write'
    WHEN 'orders' THEN 'orders.write'
    WHEN 'menu' THEN 'menu.write'
    WHEN 'inventory' THEN 'inventory.write'
    WHEN 'suppliers' THEN 'suppliers.write'
    WHEN 'shifts' THEN 'shifts.write'
    WHEN 'accounting' THEN 'accounting.write'
    ELSE NULL
  END;

INSERT INTO "NavEntry" ("id", "placement", "scopeKey", "key", "parentKey", "kind", "moduleKey", "route", "label", "icon", "subtitle", "permission", "sortOrder", "visible", "updatedAt") VALUES
  ('nav_tab_more', 'TAB', 'base', 'more', NULL, 'ROUTE', NULL, '/more', 'Altro', 'ellipsis-horizontal', NULL, NULL, 1000, true, CURRENT_TIMESTAMP),
  ('nav_set_people', 'SETTINGS', 'base', 'people', NULL, 'GROUP', NULL, NULL, 'Persone', NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP),
  ('nav_set_team', 'SETTINGS', 'base', 'team', 'people', 'ROUTE', NULL, '/settings/team', 'Dipendenti', 'people-outline', 'Chi lavora nel negozio', 'team.manage', 1, true, CURRENT_TIMESTAMP),
  ('nav_set_roles', 'SETTINGS', 'base', 'roles', 'people', 'ROUTE', NULL, '/settings/roles', 'Ruoli e permessi', 'shield-checkmark-outline', 'Chi può fare cosa', 'settings.manage', 2, true, CURRENT_TIMESTAMP),
  ('nav_set_records', 'SETTINGS', 'base', 'records', NULL, 'GROUP', NULL, NULL, 'Schede e controlli', NULL, NULL, NULL, 10, true, CURRENT_TIMESTAMP),
  ('nav_set_fields', 'SETTINGS', 'base', 'fields', 'records', 'ROUTE', NULL, '/settings/fields', 'Campi personalizzati', 'create-outline', 'Domande in più sulle schede', 'settings.manage', 11, true, CURRENT_TIMESTAMP),
  ('nav_set_checks', 'SETTINGS', 'base', 'checklists', 'records', 'ROUTE', NULL, '/settings/checklists', 'Checklist', 'checkbox-outline', 'Modelli di controllo', 'settings.manage', 12, true, CURRENT_TIMESTAMP),
  ('nav_set_app', 'SETTINGS', 'base', 'app', NULL, 'GROUP', NULL, NULL, 'La tua app', NULL, NULL, NULL, 20, true, CURRENT_TIMESTAMP),
  ('nav_set_brand', 'SETTINGS', 'base', 'branding', 'app', 'ROUTE', NULL, '/settings/branding', 'Aspetto e parole', 'color-palette-outline', 'Logo, colore e terminologia', 'settings.manage', 21, true, CURRENT_TIMESTAMP),
  ('nav_set_modules', 'SETTINGS', 'base', 'modules', 'app', 'ROUTE', NULL, '/settings/modules', 'Moduli', 'apps-outline', 'Accendi o spegni le sezioni', 'settings.manage', 22, true, CURRENT_TIMESTAMP),
  ('nav_set_store', 'SETTINGS', 'base', 'store', 'app', 'ROUTE', NULL, '/store', 'Piano e Store', 'storefront-outline', 'Scopri e sblocca i moduli', 'settings.manage', 23, true, CURRENT_TIMESTAMP),
  ('nav_set_menu', 'SETTINGS', 'base', 'menu_layout', 'app', 'ROUTE', NULL, '/settings/menu', 'Menu', 'list-outline', 'Ordine delle voci', 'settings.manage', 24, true, CURRENT_TIMESTAMP),
  ('nav_set_vocab', 'SETTINGS', 'base', 'vocab', 'app', 'ROUTE', NULL, '/settings/vocab', 'Elenchi', 'pricetags-outline', 'Tipi, reparti e categorie', 'settings.manage', 25, true, CURRENT_TIMESTAMP),
  ('nav_set_pay', 'SETTINGS', 'base', 'pay', NULL, 'GROUP', NULL, NULL, 'Clienti e pagamenti', NULL, NULL, NULL, 30, true, CURRENT_TIMESTAMP),
  ('nav_set_payments', 'SETTINGS', 'base', 'payments', 'pay', 'ROUTE', NULL, '/settings/payments', 'Incassi', 'card-outline', 'Stripe, Revolut o Satispay', 'settings.manage', 31, true, CURRENT_TIMESTAMP),
  ('nav_set_reminders', 'SETTINGS', 'base', 'reminders', 'pay', 'ROUTE', NULL, '/settings/reminders', 'Promemoria ai clienti', 'notifications-outline', 'Avvisi prima delle scadenze', 'settings.manage', 32, true, CURRENT_TIMESTAMP);

INSERT INTO "NavEntry" ("id", "placement", "scopeKey", "key", "kind", "moduleKey", "sortOrder", "visible", "updatedAt")
SELECT 'nav_home_' || "key", 'HOME_ACTIONS', 'base', "key", 'MODULE', "key", "sortOrder", true, CURRENT_TIMESTAMP
FROM "ModuleDef"
WHERE "key" NOT IN ('dashboard', 'settings');

INSERT INTO "NavEntry" ("id", "placement", "categoryId", "scopeKey", "key", "kind", "moduleKey", "sortOrder", "visible", "updatedAt")
SELECT 'nav_tab_' || cm."id", 'TAB', cm."categoryId", 'category:' || cm."categoryId", cm."moduleKey", 'MODULE', cm."moduleKey", COALESCE(cm."sortOrder", 0), cm."tab", CURRENT_TIMESTAMP
FROM "CategoryModule" cm
WHERE cm."tab" IS NOT NULL AND cm."included" = true
ON CONFLICT ("placement", "key", "scopeKey") DO NOTHING;

INSERT INTO "PlatformSetting" ("key", "intValue", "textValue", "updatedAt") VALUES
  ('included_seats', 3, NULL, CURRENT_TIMESTAMP),
  ('extra_seat_cents', 500, NULL, CURRENT_TIMESTAMP),
  ('default_accent', NULL, '#2F6FED', CURRENT_TIMESTAMP),
  ('legal_version', NULL, '2026-09-26', CURRENT_TIMESTAMP);

-- Shop columns copied out of the JSON blobs.
UPDATE "Tenant" SET
  "accent" = CASE WHEN "branding"->>'accent' ~ '^#[0-9A-Fa-f]{6}$' THEN "branding"->>'accent' ELSE NULL END,
  "logoUrl" = NULLIF("branding"->>'logoUrl', ''),
  "activity" = NULLIF(left("settings"->>'activity', 40), ''),
  "menuSourceUrl" = NULLIF("settings"->>'menuSourceUrl', '');

INSERT INTO "TenantPaymentSettings" ("tenantId", "provider", "revolut", "satispay", "stripeSecretKey", "updatedAt")
SELECT t."id",
  CASE WHEN t."settings"->'payments'->>'provider' IN ('STRIPE', 'REVOLUT', 'SATISPAY') THEN t."settings"->'payments'->>'provider' ELSE NULL END,
  NULLIF(t."settings"->'payments'->>'revolut', ''),
  NULLIF(t."settings"->'payments'->>'satispay', ''),
  NULLIF(t."settings"->'payments'->>'stripeSecretKey', ''),
  CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE jsonb_typeof(t."settings"->'payments') = 'object';

INSERT INTO "TenantReminderSettings" ("tenantId", "enabled", "daysBefore", "autoEmail", "message", "updatedAt")
SELECT t."id",
  COALESCE(t."settings"->'customerReminders'->>'enabled' = 'true', false),
  CASE
    WHEN (t."settings"->'customerReminders'->>'daysBefore') ~ '^[0-9]+$'
      AND (t."settings"->'customerReminders'->>'daysBefore')::int BETWEEN 1 AND 120
    THEN (t."settings"->'customerReminders'->>'daysBefore')::int
    ELSE 30
  END,
  COALESCE(t."settings"->'customerReminders'->>'autoEmail' <> 'false', true),
  NULLIF(btrim(t."settings"->'customerReminders'->>'message'), ''),
  CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE jsonb_typeof(t."settings"->'customerReminders') = 'object';

INSERT INTO "TermValue" ("id", "termKey", "categoryId", "scopeKey", "value", "updatedAt")
SELECT 'tv_c_' || md5(c."id" || e."key"), e."key", c."id", 'category:' || c."id", left(btrim(e."value"), 40), CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_each_text(c."terminology") AS e("key", "value")
WHERE jsonb_typeof(c."terminology") = 'object'
  AND e."key" IN (SELECT "key" FROM "TermDef")
  AND length(btrim(e."value")) >= 2
ON CONFLICT ("termKey", "scopeKey") DO NOTHING;

INSERT INTO "TermValue" ("id", "termKey", "tenantId", "scopeKey", "value", "updatedAt")
SELECT 'tv_t_' || md5(t."id" || e."key"), e."key", t."id", 'tenant:' || t."id", left(btrim(e."value"), 40), CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN LATERAL jsonb_each_text(COALESCE(t."settings"->'terminology', '{}'::jsonb)) AS e("key", "value")
WHERE e."key" IN (SELECT "key" FROM "TermDef")
  AND length(btrim(e."value")) >= 2
ON CONFLICT ("termKey", "scopeKey") DO NOTHING;

-- Category fields, lists and checklist presets.
INSERT INTO "FieldDef" ("id", "entityId", "categoryId", "scopeKey", "key", "label", "type", "builtIn", "required", "visible", "sortOrder", "updatedAt")
SELECT 'fd_cat_' || md5(c."id" || (f."field"->>'entity') || (f."field"->>'key')),
  CASE f."field"->>'entity'
    WHEN 'CUSTOMER' THEN 'customer'
    WHEN 'ASSET' THEN 'asset'
    WHEN 'WORK_ORDER' THEN 'work_order'
    WHEN 'PRODUCT' THEN 'menu_item'
  END,
  c."id",
  'category:' || c."id",
  f."field"->>'key',
  left(f."field"->>'label', 60),
  (f."field"->>'type')::"FieldType",
  false,
  false,
  true,
  (f."ord" - 1)::int,
  CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_array_elements(c."presets"->'customFields') WITH ORDINALITY AS f("field", "ord")
WHERE jsonb_typeof(c."presets"->'customFields') = 'array'
  AND f."field"->>'entity' IN ('CUSTOMER', 'ASSET', 'WORK_ORDER', 'PRODUCT')
  AND f."field"->>'type' IN ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'PHOTO')
  AND f."field"->>'key' ~ '^[a-z][a-z0-9_]{0,39}$'
ON CONFLICT ("entityId", "key", "scopeKey") DO NOTHING;

INSERT INTO "FieldOption" ("id", "fieldId", "value", "label", "sortOrder", "updatedAt")
SELECT 'fo_cat_' || md5(d."id" || opt."value"), d."id", left(opt."value", 60), left(opt."value", 60), (opt."ord" - 1)::int, CURRENT_TIMESTAMP
FROM "FieldDef" d
JOIN "Category" c ON c."id" = d."categoryId"
CROSS JOIN LATERAL jsonb_array_elements(c."presets"->'customFields') AS f("field")
CROSS JOIN LATERAL jsonb_array_elements_text(f."field"->'options') WITH ORDINALITY AS opt("value", "ord")
WHERE d."id" = 'fd_cat_' || md5(c."id" || (f."field"->>'entity') || (f."field"->>'key'))
  AND length(btrim(opt."value")) > 0
ON CONFLICT ("fieldId", "value") DO NOTHING;

INSERT INTO "ChecklistPreset" ("id", "categoryId", "name", "kind", "sortOrder", "updatedAt")
SELECT 'cp_' || md5(c."id" || (cl."list"->>'name')), c."id", left(cl."list"->>'name', 80), COALESCE(NULLIF(cl."list"->>'kind', ''), 'GENERIC'), (cl."ord" - 1)::int, CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_array_elements(c."presets"->'checklists') WITH ORDINALITY AS cl("list", "ord")
WHERE jsonb_typeof(c."presets"->'checklists') = 'array'
  AND length(btrim(cl."list"->>'name')) >= 2
ON CONFLICT ("categoryId", "name") DO NOTHING;

INSERT INTO "ChecklistPresetItem" ("id", "presetId", "itemKey", "label", "sortOrder", "updatedAt")
SELECT 'cpi_' || md5(p."id" || (item."row"->>'id')), p."id", left(item."row"->>'id', 40), left(item."row"->>'label', 120), (item."ord" - 1)::int, CURRENT_TIMESTAMP
FROM "ChecklistPreset" p
JOIN "Category" c ON c."id" = p."categoryId"
CROSS JOIN LATERAL jsonb_array_elements(c."presets"->'checklists') AS cl("list")
CROSS JOIN LATERAL jsonb_array_elements(cl."list"->'items') WITH ORDINALITY AS item("row", "ord")
WHERE p."id" = 'cp_' || md5(c."id" || (cl."list"->>'name'))
  AND length(COALESCE(item."row"->>'id', '')) >= 1
  AND length(btrim(COALESCE(item."row"->>'label', ''))) >= 1
ON CONFLICT ("presetId", "itemKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "categoryId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_at_' || md5(c."id" || t."label" || t."ord"::text), 'asset_types', c."id", 'category:' || c."id",
  left(regexp_replace(lower(t."label"), '[^a-z0-9]+', '_', 'g'), 28) || '_' || t."ord"::text,
  left(t."label", 80), (t."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_array_elements_text(c."presets"->'assetTypes') WITH ORDINALITY AS t("label", "ord")
WHERE jsonb_typeof(c."presets"->'assetTypes') = 'array' AND length(btrim(t."label")) >= 1
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "categoryId", "scopeKey", "key", "label", "tone", "minutes", "sortOrder", "visible", "updatedAt")
SELECT 'vi_sk_' || md5(c."id" || (k."item"->>'key')), 'schedule_kinds', c."id", 'category:' || c."id",
  k."item"->>'key', left(k."item"->>'label', 40),
  CASE WHEN k."item"->>'tone' IN ('accent', 'warning', 'success') THEN k."item"->>'tone' ELSE NULL END,
  CASE WHEN (k."item"->>'minutes') ~ '^[0-9]+$' THEN (k."item"->>'minutes')::int ELSE NULL END,
  (k."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_array_elements(c."presets"->'scheduleKinds') WITH ORDINALITY AS k("item", "ord")
WHERE jsonb_typeof(c."presets"->'scheduleKinds') = 'array'
  AND k."item"->>'key' ~ '^[A-Z][A-Z0-9_]{1,39}$'
  AND length(btrim(COALESCE(k."item"->>'label', ''))) >= 1
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "categoryId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_st_' || md5(c."id" || (s."item"->>'key')), 'stations', c."id", 'category:' || c."id",
  s."item"->>'key', left(s."item"->>'label', 40), (s."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_array_elements(c."presets"->'stations') WITH ORDINALITY AS s("item", "ord")
WHERE jsonb_typeof(c."presets"->'stations') = 'array'
  AND s."item"->>'key' ~ '^[A-Z][A-Z0-9_]{1,39}$'
  AND length(btrim(COALESCE(s."item"->>'label', ''))) >= 1
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "categoryId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_led_' || md5(c."id" || side."list" || label."value"), side."list", c."id", 'category:' || c."id",
  left(regexp_replace(lower(label."value"), '[^a-z0-9]+', '_', 'g'), 28) || '_' || label."ord"::text,
  left(label."value", 40), (label."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN (VALUES ('ledger_income', 'income'), ('ledger_expense', 'expense')) AS side("list", "prop")
CROSS JOIN LATERAL jsonb_array_elements_text(c."presets"->'ledger'->side."prop") WITH ORDINALITY AS label("value", "ord")
WHERE jsonb_typeof(c."presets"->'ledger'->side."prop") = 'array' AND length(btrim(label."value")) >= 2
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "categoryId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_dash_' || md5(c."id" || w."value"), 'dashboard_widgets', c."id", 'category:' || c."id",
  left(w."value", 40), left(w."value", 40), (w."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN LATERAL jsonb_array_elements_text(c."presets"->'dashboard') WITH ORDINALITY AS w("value", "ord")
WHERE jsonb_typeof(c."presets"->'dashboard') = 'array' AND length(btrim(w."value")) >= 2
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

-- Per-shop lists written by the assistant for a generic activity.
INSERT INTO "VocabItem" ("id", "listKey", "tenantId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_tat_' || md5(t."id" || label."value" || label."ord"::text), 'asset_types', t."id", 'tenant:' || t."id",
  left(regexp_replace(lower(label."value"), '[^a-z0-9]+', '_', 'g'), 28) || '_' || label."ord"::text,
  left(label."value", 80), (label."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN LATERAL jsonb_array_elements_text(t."settings"->'presets'->'assetTypes') WITH ORDINALITY AS label("value", "ord")
WHERE jsonb_typeof(t."settings"->'presets'->'assetTypes') = 'array' AND length(btrim(label."value")) >= 1
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "tenantId", "scopeKey", "key", "label", "tone", "sortOrder", "visible", "updatedAt")
SELECT 'vi_tsk_' || md5(t."id" || (k."item"->>'key')), 'schedule_kinds', t."id", 'tenant:' || t."id",
  k."item"->>'key', left(k."item"->>'label', 40),
  CASE WHEN k."item"->>'tone' IN ('accent', 'warning', 'success') THEN k."item"->>'tone' ELSE NULL END,
  (k."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN LATERAL jsonb_array_elements(t."settings"->'presets'->'scheduleKinds') WITH ORDINALITY AS k("item", "ord")
WHERE jsonb_typeof(t."settings"->'presets'->'scheduleKinds') = 'array'
  AND k."item"->>'key' ~ '^[A-Z][A-Z0-9_]{1,39}$'
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

INSERT INTO "VocabItem" ("id", "listKey", "tenantId", "scopeKey", "key", "label", "sortOrder", "visible", "updatedAt")
SELECT 'vi_tst_' || md5(t."id" || (s."item"->>'key')), 'stations', t."id", 'tenant:' || t."id",
  s."item"->>'key', left(s."item"->>'label', 40), (s."ord" - 1)::int, true, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN LATERAL jsonb_array_elements(t."settings"->'presets'->'stations') WITH ORDINALITY AS s("item", "ord")
WHERE jsonb_typeof(t."settings"->'presets'->'stations') = 'array'
  AND s."item"->>'key' ~ '^[A-Z][A-Z0-9_]{1,39}$'
ON CONFLICT ("listKey", "key", "scopeKey") DO NOTHING;

-- Shop field definitions, then the values stored on each record.
INSERT INTO "FieldDef" ("id", "entityId", "tenantId", "scopeKey", "key", "label", "type", "builtIn", "required", "visible", "sortOrder", "updatedAt")
SELECT 'fd_shop_' || c."id",
  CASE c."entity"::text
    WHEN 'CUSTOMER' THEN 'customer'
    WHEN 'ASSET' THEN 'asset'
    WHEN 'WORK_ORDER' THEN 'work_order'
    WHEN 'PRODUCT' THEN 'menu_item'
  END,
  c."tenantId",
  'tenant:' || c."tenantId",
  c."key",
  c."label",
  c."type"::text::"FieldType",
  false,
  c."required",
  true,
  100,
  CURRENT_TIMESTAMP
FROM "CustomFieldDef" c
ON CONFLICT ("entityId", "key", "scopeKey") DO NOTHING;

INSERT INTO "FieldOption" ("id", "fieldId", "value", "label", "sortOrder", "updatedAt")
SELECT 'fo_shop_' || md5(c."id" || opt."value"), 'fd_shop_' || c."id", left(opt."value", 60), left(opt."value", 60), (opt."ord" - 1)::int, CURRENT_TIMESTAMP
FROM "CustomFieldDef" c
CROSS JOIN LATERAL jsonb_array_elements_text(c."options") WITH ORDINALITY AS opt("value", "ord")
WHERE jsonb_typeof(c."options") = 'array' AND length(btrim(opt."value")) > 0
ON CONFLICT ("fieldId", "value") DO NOTHING;

INSERT INTO "FieldValue" ("id", "tenantId", "entityKey", "recordId", "fieldKey", "textValue", "numberValue", "boolValue", "updatedAt")
SELECT 'fv_' || md5(src."recordId" || src."fieldKey"), src."tenantId", src."entityKey", src."recordId", src."fieldKey",
  left(src."text", 4000),
  CASE WHEN src."text" ~ '^-?[0-9]+(\.[0-9]+)?$' THEN src."text"::numeric ELSE NULL END,
  CASE WHEN src."text" IN ('true', 'false') THEN src."text"::boolean ELSE NULL END,
  CURRENT_TIMESTAMP
FROM (
  SELECT c."tenantId", 'customer' AS "entityKey", c."id" AS "recordId", e."key" AS "fieldKey", e."value" #>> '{}' AS "text"
  FROM "Customer" c
  CROSS JOIN LATERAL jsonb_each(c."customFields") AS e("key", "value")
  WHERE jsonb_typeof(c."customFields") = 'object' AND jsonb_typeof(e."value") IN ('string', 'number', 'boolean')
  UNION ALL
  SELECT a."tenantId", 'asset', a."id", e."key", e."value" #>> '{}'
  FROM "Asset" a
  CROSS JOIN LATERAL jsonb_each(a."customFields") AS e("key", "value")
  WHERE jsonb_typeof(a."customFields") = 'object' AND jsonb_typeof(e."value") IN ('string', 'number', 'boolean')
  UNION ALL
  SELECT w."tenantId", 'work_order', w."id", e."key", e."value" #>> '{}'
  FROM "WorkOrder" w
  CROSS JOIN LATERAL jsonb_each(w."customFields") AS e("key", "value")
  WHERE jsonb_typeof(w."customFields") = 'object' AND jsonb_typeof(e."value") IN ('string', 'number', 'boolean')
  UNION ALL
  SELECT m."tenantId", 'menu_item', m."id", e."key", e."value" #>> '{}'
  FROM "MenuItem" m
  CROSS JOIN LATERAL jsonb_each(m."customFields") AS e("key", "value")
  WHERE jsonb_typeof(m."customFields") = 'object' AND jsonb_typeof(e."value") IN ('string', 'number', 'boolean')
) src
WHERE src."text" IS NOT NULL AND btrim(src."text") <> '' AND src."text" <> 'null'
ON CONFLICT ("recordId", "fieldKey", "textValue") DO NOTHING;

INSERT INTO "ChecklistTemplateItem" ("id", "templateId", "itemKey", "label", "sortOrder", "updatedAt")
SELECT 'cti_' || md5(t."id" || (item."row"->>'id')), t."id", left(item."row"->>'id', 40), left(item."row"->>'label', 200), (item."ord" - 1)::int, CURRENT_TIMESTAMP
FROM "ChecklistTemplate" t
CROSS JOIN LATERAL jsonb_array_elements(t."items") WITH ORDINALITY AS item("row", "ord")
WHERE jsonb_typeof(t."items") = 'array'
  AND length(COALESCE(item."row"->>'id', '')) >= 1
ON CONFLICT ("templateId", "itemKey") DO NOTHING;

INSERT INTO "ChecklistAnswer" ("id", "runId", "itemKey", "label", "checked", "note", "sortOrder", "updatedAt")
SELECT 'ca_' || md5(r."id" || (a."row"->>'id')), r."id", left(a."row"->>'id', 40), left(COALESCE(a."row"->>'label', ''), 200),
  COALESCE(a."row"->>'checked' = 'true', false), NULLIF(a."row"->>'note', ''), (a."ord" - 1)::int, CURRENT_TIMESTAMP
FROM "ChecklistRun" r
CROSS JOIN LATERAL jsonb_array_elements(r."answers") WITH ORDINALITY AS a("row", "ord")
WHERE jsonb_typeof(r."answers") = 'array'
  AND length(COALESCE(a."row"->>'id', '')) >= 1
ON CONFLICT ("runId", "itemKey") DO NOTHING;

-- Demo records. Field keys match the columns the sample loader writes.
CREATE OR REPLACE FUNCTION config_sample(p_category text, p_entity text, p_ref text, p_sort int) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  sid text := 'smp_' || md5(p_category || ':' || p_ref);
BEGIN
  INSERT INTO "SampleRecord" ("id", "categoryId", "entityKey", "ref", "sortOrder", "updatedAt")
  VALUES (sid, p_category, p_entity, left(p_ref, 160), p_sort, CURRENT_TIMESTAMP)
  ON CONFLICT ("categoryId", "ref") DO NOTHING;
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION config_sval(p_sample text, p_field text, p_text text, p_num numeric DEFAULT NULL, p_bool boolean DEFAULT NULL, p_ref text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN; END IF;
  INSERT INTO "SampleValue" ("id", "sampleId", "fieldKey", "textValue", "numberValue", "boolValue", "refSample", "updatedAt")
  VALUES ('sv_' || md5(p_sample || ':' || p_field || ':' || p_text), p_sample, p_field, left(p_text, 500), p_num, p_bool, p_ref, CURRENT_TIMESTAMP)
  ON CONFLICT ("sampleId", "fieldKey", "textValue") DO NOTHING;
END $$;

DO $$
DECLARE
  cat record;
  sample jsonb;
  item jsonb;
  nested jsonb;
  field record;
  line record;
  idx int;
  sid text;
  line_id text;
  ref text;
BEGIN
  FOR cat IN
    SELECT "id", "presets"->'sample' AS sample
    FROM "Category"
    WHERE jsonb_typeof("presets"->'sample') = 'object'
  LOOP
    sample := cat.sample;

    IF jsonb_typeof(sample->'customer') = 'object' THEN
      sid := config_sample(cat.id, 'customer', 'customer', 0);
      PERFORM config_sval(sid, 'name', sample#>>'{customer,name}');
      PERFORM config_sval(sid, 'phone', sample#>>'{customer,phone}');
      PERFORM config_sval(sid, 'city', sample#>>'{customer,city}');
      PERFORM config_sval(sid, 'address', sample#>>'{customer,address}');
    END IF;

    IF jsonb_typeof(sample->'stockLocations') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'stockLocations') LOOP
        ref := 'stock:' || COALESCE(item->>'name', idx::text);
        sid := config_sample(cat.id, 'stock_location', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'kind', item->>'kind');
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'asset') = 'object' THEN
      sample := jsonb_set(sample, '{assets}', COALESCE(sample->'assets', '[]'::jsonb) || jsonb_build_array(sample->'asset'));
    END IF;
    IF jsonb_typeof(sample->'assets') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'assets') LOOP
        ref := 'asset:' || idx::text;
        sid := config_sample(cat.id, 'asset', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'type', item->>'type');
        PERFORM config_sval(sid, 'brand', item->>'brand');
        PERFORM config_sval(sid, 'model', item->>'model');
        PERFORM config_sval(sid, 'serialNumber', item->>'serialNumber');
        IF jsonb_typeof(item->'customFields') = 'object' THEN
          FOR field IN SELECT key, value FROM jsonb_each(item->'customFields') LOOP
            PERFORM config_sval(sid, field.key, field.value #>> '{}');
          END LOOP;
        END IF;
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'parts') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'parts') LOOP
        ref := 'part:' || COALESCE(item->>'sku', idx::text);
        sid := config_sample(cat.id, 'product', ref, idx);
        PERFORM config_sval(sid, 'sku', item->>'sku');
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'brand', item->>'brand');
        PERFORM config_sval(sid, 'barcode', item->>'barcode');
        PERFORM config_sval(sid, 'unitPrice', item->>'price', NULLIF(item->>'price', '')::numeric);
        IF jsonb_typeof(item->'models') = 'array' THEN
          FOR nested IN SELECT value FROM jsonb_array_elements(item->'models') LOOP
            PERFORM config_sval(sid, 'compatibleModels', nested #>> '{}');
          END LOOP;
        END IF;
        IF jsonb_typeof(item->'stock') = 'array' THEN
          FOR nested IN SELECT value FROM jsonb_array_elements(item->'stock') LOOP
            PERFORM config_sval(sid, 'stock', (nested->>'location') || '|' || COALESCE(nested->>'quantity', '0'), NULLIF(nested->>'quantity', '')::numeric, NULL, 'stock:' || COALESCE(nested->>'location', ''));
          END LOOP;
        END IF;
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'workOrder') = 'string' THEN
      sid := config_sample(cat.id, 'work_order', 'work_order', 0);
      PERFORM config_sval(sid, 'title', sample->>'workOrder');
    END IF;

    IF sample ? 'schedule' THEN
      sid := config_sample(cat.id, 'schedule', 'schedule', 0);
      IF jsonb_typeof(sample->'schedule') = 'string' THEN
        PERFORM config_sval(sid, 'title', sample->>'schedule');
      ELSE
        PERFORM config_sval(sid, 'title', sample#>>'{schedule,title}');
        PERFORM config_sval(sid, 'kind', sample#>>'{schedule,kind}');
        PERFORM config_sval(sid, 'intervalMonths', sample#>>'{schedule,intervalMonths}', NULLIF(sample#>>'{schedule,intervalMonths}', '')::numeric);
        PERFORM config_sval(sid, 'dueInDays', sample#>>'{schedule,dueInDays}', NULLIF(sample#>>'{schedule,dueInDays}', '')::numeric);
      END IF;
    END IF;

    IF jsonb_typeof(sample->'tables') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'tables') LOOP
        ref := 'table:' || COALESCE(item->>'name', idx::text);
        sid := config_sample(cat.id, 'dining_table', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'posX', item->>'posX', NULLIF(item->>'posX', '')::numeric);
        PERFORM config_sval(sid, 'posY', item->>'posY', NULLIF(item->>'posY', '')::numeric);
        PERFORM config_sval(sid, 'seats', item->>'seats', NULLIF(item->>'seats', '')::numeric);
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'modifiers') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'modifiers') LOOP
        ref := 'modifier:' || COALESCE(item->>'name', idx::text);
        sid := config_sample(cat.id, 'modifier', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'priceDelta', COALESCE(item->>'priceDelta', '0'), NULLIF(item->>'priceDelta', '')::numeric);
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'ingredients') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'ingredients') LOOP
        ref := 'ingredient:' || COALESCE(item->>'name', idx::text);
        sid := config_sample(cat.id, 'ingredient', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'unit', item->>'unit');
        PERFORM config_sval(sid, 'sku', item->>'sku');
        PERFORM config_sval(sid, 'category', item->>'category');
        PERFORM config_sval(sid, 'minQuantity', item->>'min', NULLIF(item->>'min', '')::numeric);
        PERFORM config_sval(sid, 'unitCost', item->>'cost', NULLIF(item->>'cost', '')::numeric);
        IF jsonb_typeof(item->'stock') = 'array' THEN
          FOR nested IN SELECT value FROM jsonb_array_elements(item->'stock') LOOP
            PERFORM config_sval(sid, 'stock', (nested->>'location') || '|' || COALESCE(nested->>'quantity', '0'), NULLIF(nested->>'quantity', '')::numeric, NULL, 'stock:' || COALESCE(nested->>'location', ''));
          END LOOP;
        END IF;
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'menu') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'menu') LOOP
        ref := 'menu:' || COALESCE(item->>'name', idx::text);
        sid := config_sample(cat.id, 'menu_item', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'category', item->>'category');
        PERFORM config_sval(sid, 'station', item->>'station');
        PERFORM config_sval(sid, 'price', item->>'price', NULLIF(item->>'price', '')::numeric);
        IF jsonb_typeof(item->'modifiers') = 'array' THEN
          FOR nested IN SELECT value FROM jsonb_array_elements(item->'modifiers') LOOP
            PERFORM config_sval(sid, 'modifiers', nested #>> '{}', NULL, NULL, 'modifier:' || (nested #>> '{}'));
          END LOOP;
        END IF;
        IF jsonb_typeof(item->'recipe') = 'array' THEN
          FOR nested IN SELECT value FROM jsonb_array_elements(item->'recipe') LOOP
            PERFORM config_sval(sid, 'recipe', (nested->>'ingredient') || '|' || COALESCE(nested->>'quantity', '0'), NULLIF(nested->>'quantity', '')::numeric, NULL, 'ingredient:' || COALESCE(nested->>'ingredient', ''));
          END LOOP;
        END IF;
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'suppliers') = 'array' THEN
      idx := 0;
      FOR item IN SELECT value FROM jsonb_array_elements(sample->'suppliers') LOOP
        ref := 'supplier:' || COALESCE(item->>'name', idx::text);
        sid := config_sample(cat.id, 'supplier', ref, idx);
        PERFORM config_sval(sid, 'name', item->>'name');
        PERFORM config_sval(sid, 'phone', item->>'phone');
        PERFORM config_sval(sid, 'email', item->>'email');
        IF jsonb_typeof(item->'order') = 'array' THEN
          FOR line IN SELECT src.value, src.ord FROM jsonb_array_elements(item->'order') WITH ORDINALITY AS src(value, ord) LOOP
            line_id := config_sample(cat.id, 'purchase_line', ref || ':line:' || (line.ord - 1)::text, line.ord::int);
            PERFORM config_sval(line_id, 'supplier', item->>'name', NULL, NULL, ref);
            PERFORM config_sval(line_id, 'ingredient', line.value->>'ingredient', NULL, NULL, 'ingredient:' || COALESCE(line.value->>'ingredient', ''));
            PERFORM config_sval(line_id, 'description', line.value->>'description');
            PERFORM config_sval(line_id, 'quantity', line.value->>'quantity', NULLIF(line.value->>'quantity', '')::numeric);
            PERFORM config_sval(line_id, 'unitPrice', line.value->>'unitPrice', NULLIF(line.value->>'unitPrice', '')::numeric);
          END LOOP;
        END IF;
        idx := idx + 1;
      END LOOP;
    END IF;

    IF jsonb_typeof(sample->'shift') = 'object' THEN
      sid := config_sample(cat.id, 'shift', 'shift', 0);
      PERFORM config_sval(sid, 'roleLabel', sample#>>'{shift,roleLabel}');
      PERFORM config_sval(sid, 'start', sample#>>'{shift,start}');
      PERFORM config_sval(sid, 'end', sample#>>'{shift,end}');
    END IF;

    IF jsonb_typeof(sample->'order') = 'object' THEN
      sid := config_sample(cat.id, 'order', 'order', 0);
      PERFORM config_sval(sid, 'table', sample#>>'{order,table}', NULL, NULL, 'table:' || COALESCE(sample#>>'{order,table}', ''));
      PERFORM config_sval(sid, 'covers', sample#>>'{order,covers}', NULLIF(sample#>>'{order,covers}', '')::numeric);
      IF jsonb_typeof(sample->'order'->'lines') = 'array' THEN
        idx := 0;
        FOR item IN SELECT value FROM jsonb_array_elements(sample->'order'->'lines') LOOP
          ref := 'order_line:' || idx::text;
        line_id := config_sample(cat.id, 'order_line', ref, idx);
        PERFORM config_sval(line_id, 'item', item->>'item', NULL, NULL, 'menu:' || COALESCE(item->>'item', ''));
        PERFORM config_sval(line_id, 'quantity', COALESCE(item->>'quantity', '1'), NULLIF(COALESCE(item->>'quantity', '1'), '')::numeric);
        PERFORM config_sval(line_id, 'status', item->>'status');
        idx := idx + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP FUNCTION config_sval(text, text, text, numeric, boolean, text);
DROP FUNCTION config_sample(text, text, text, int);
