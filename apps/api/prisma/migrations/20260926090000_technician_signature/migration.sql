-- The technician signs the rapportino separately from the customer.
ALTER TABLE "WorkOrder" ADD COLUMN "technicianSignature" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "technicianSignedBy" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "technicianSignedAt" TIMESTAMP(3);
