ALTER TABLE "ModuleDef" ADD COLUMN "stripeProductId" TEXT;
ALTER TABLE "ModuleDef" ADD COLUMN "stripePriceId" TEXT;

CREATE UNIQUE INDEX "ModuleDef_stripeProductId_key" ON "ModuleDef"("stripeProductId");
CREATE UNIQUE INDEX "ModuleDef_stripePriceId_key" ON "ModuleDef"("stripePriceId");
