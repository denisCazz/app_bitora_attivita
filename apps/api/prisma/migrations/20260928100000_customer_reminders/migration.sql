-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "reminderOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "CustomerReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerReminder_tenantId_sentAt_idx" ON "CustomerReminder"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "CustomerReminder_customerId_idx" ON "CustomerReminder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReminder_scheduleId_dueAt_channel_key" ON "CustomerReminder"("scheduleId", "dueAt", "channel");

-- CreateIndex
CREATE INDEX "WorkOrder_scheduleId_idx" ON "WorkOrder"("scheduleId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReminder" ADD CONSTRAINT "CustomerReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReminder" ADD CONSTRAINT "CustomerReminder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReminder" ADD CONSTRAINT "CustomerReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

