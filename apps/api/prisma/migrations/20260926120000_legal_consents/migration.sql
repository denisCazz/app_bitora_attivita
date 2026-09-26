-- Proof of acceptance of Terms/Privacy (GDPR art. 5.2, 7.1) and of the AI assistant disclosure.
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "aiConsentAt" TIMESTAMP(3);
