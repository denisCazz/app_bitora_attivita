-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "TenantModule" ADD COLUMN     "licensed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "TenantModule_stripeSubscriptionId_idx" ON "TenantModule"("stripeSubscriptionId");

