-- Sign in with Apple / Google: those accounts have no password.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "appleSub" TEXT;
ALTER TABLE "User" ADD COLUMN "appleRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;

CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
