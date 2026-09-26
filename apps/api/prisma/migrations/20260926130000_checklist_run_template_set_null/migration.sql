-- Deleting a checklist template keeps the runs already filled in, like schedules do.
ALTER TABLE "ChecklistRun" DROP CONSTRAINT "ChecklistRun_templateId_fkey";
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
