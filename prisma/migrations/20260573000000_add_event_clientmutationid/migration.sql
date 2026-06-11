-- Idempotency key for offline-replayed event POSTs
ALTER TABLE "Event" ADD COLUMN "clientMutationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_clientMutationId_key" ON "Event"("clientMutationId");
