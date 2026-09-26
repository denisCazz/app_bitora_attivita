-- Anagrafica fornitore e date dell'ordine d'acquisto.
ALTER TABLE "Supplier" ADD COLUMN "vat" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "address" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "city" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "paymentTerms" TEXT;

ALTER TABLE "PurchaseOrder" ADD COLUMN "notes" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "expectedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN "receivedAt" TIMESTAMP(3);
