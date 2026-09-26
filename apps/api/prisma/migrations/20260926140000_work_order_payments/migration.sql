-- One collection per intervention: status, pay link, and the ledger row it writes.
CREATE TYPE "WorkPaymentStatus" AS ENUM ('DUE', 'PARTIAL', 'PAID', 'CANCELLED');

CREATE TABLE "WorkOrderPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "customerId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "WorkPaymentStatus" NOT NULL DEFAULT 'DUE',
    "method" TEXT,
    "token" TEXT NOT NULL,
    "note" TEXT,
    "sentEmailAt" TIMESTAMP(3),
    "sentWhatsappAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderPayment_workOrderId_key" ON "WorkOrderPayment"("workOrderId");
CREATE UNIQUE INDEX "WorkOrderPayment_token_key" ON "WorkOrderPayment"("token");
CREATE UNIQUE INDEX "WorkOrderPayment_ledgerEntryId_key" ON "WorkOrderPayment"("ledgerEntryId");
CREATE INDEX "WorkOrderPayment_tenantId_status_idx" ON "WorkOrderPayment"("tenantId", "status");
CREATE INDEX "WorkOrderPayment_customerId_idx" ON "WorkOrderPayment"("customerId");

ALTER TABLE "WorkOrderPayment" ADD CONSTRAINT "WorkOrderPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderPayment" ADD CONSTRAINT "WorkOrderPayment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderPayment" ADD CONSTRAINT "WorkOrderPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderPayment" ADD CONSTRAINT "WorkOrderPayment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
