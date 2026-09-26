-- Hourly pay on each person, and one expense per employee per month.
ALTER TABLE "Membership" ADD COLUMN "hourlyRate" DECIMAL(8,2),
ADD COLUMN "overtimeRate" DECIMAL(8,2),
ADD COLUMN "weeklyHours" DECIMAL(5,2) NOT NULL DEFAULT 40;

CREATE TABLE "PayrollPosting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "hourlyRate" DECIMAL(8,2) NOT NULL,
    "overtimeRate" DECIMAL(8,2) NOT NULL,
    "weeklyHours" DECIMAL(5,2) NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPosting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollPosting_tenantId_userId_month_key" ON "PayrollPosting"("tenantId", "userId", "month");
CREATE UNIQUE INDEX "PayrollPosting_ledgerEntryId_key" ON "PayrollPosting"("ledgerEntryId");
CREATE INDEX "PayrollPosting_tenantId_month_idx" ON "PayrollPosting"("tenantId", "month");

ALTER TABLE "PayrollPosting" ADD CONSTRAINT "PayrollPosting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPosting" ADD CONSTRAINT "PayrollPosting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPosting" ADD CONSTRAINT "PayrollPosting_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
