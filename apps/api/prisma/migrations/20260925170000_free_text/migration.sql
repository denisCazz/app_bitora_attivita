ALTER TABLE "CategoryModule" ADD COLUMN "description" TEXT;

ALTER TABLE "ChecklistRun" ALTER COLUMN "templateId" DROP NOT NULL;
