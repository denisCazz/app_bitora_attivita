-- Where a notification opens, and a key so the same alert is not sent again within the cooldown.
ALTER TABLE "Notification" ADD COLUMN "href" TEXT;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

CREATE INDEX "Notification_tenantId_userId_dedupeKey_idx" ON "Notification"("tenantId", "userId", "dedupeKey");
