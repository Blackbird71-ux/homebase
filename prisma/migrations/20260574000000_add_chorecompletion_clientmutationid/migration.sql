-- Idempotency key for offline-replayed chore completions
ALTER TABLE "ChoreCompletion" ADD COLUMN "clientMutationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChoreCompletion_clientMutationId_key" ON "ChoreCompletion"("clientMutationId");
