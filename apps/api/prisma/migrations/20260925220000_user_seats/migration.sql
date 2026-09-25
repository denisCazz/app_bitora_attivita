-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "extraSeats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "seatsStripeSubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_seatsStripeSubscriptionId_idx" ON "Tenant"("seatsStripeSubscriptionId");
