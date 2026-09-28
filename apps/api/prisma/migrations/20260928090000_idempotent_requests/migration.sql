-- CreateTable
CREATE TABLE "IdempotentRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotentRequest_createdAt_idx" ON "IdempotentRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotentRequest_userId_key_key" ON "IdempotentRequest"("userId", "key");

-- AddForeignKey
ALTER TABLE "IdempotentRequest" ADD CONSTRAINT "IdempotentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

