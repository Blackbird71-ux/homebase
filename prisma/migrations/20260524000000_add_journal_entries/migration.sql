-- CreateTable: FinanceJournalEntry
CREATE TABLE "FinanceJournalEntry" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "reference"    TEXT,
    "date"         DATETIME NOT NULL,
    "description"  TEXT     NOT NULL,
    "type"         TEXT     NOT NULL DEFAULT 'manual',
    "isPosted"     BOOLEAN  NOT NULL DEFAULT false,
    "isReversed"   BOOLEAN  NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "entityId"     TEXT,
    "familyId"     TEXT     NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceJournalEntry_reversalOfId_fkey"
        FOREIGN KEY ("reversalOfId") REFERENCES "FinanceJournalEntry" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceJournalEntry_entityId_fkey"
        FOREIGN KEY ("entityId") REFERENCES "FinanceEntity" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceJournalEntry_familyId_fkey"
        FOREIGN KEY ("familyId") REFERENCES "Family" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: FinanceJournalLine
CREATE TABLE "FinanceJournalLine" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "journalEntryId" TEXT     NOT NULL,
    "glAccountId"    TEXT     NOT NULL,
    "side"           TEXT     NOT NULL,
    "amount"         REAL     NOT NULL,
    "description"    TEXT,
    "memberId"       TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceJournalLine_journalEntryId_fkey"
        FOREIGN KEY ("journalEntryId") REFERENCES "FinanceJournalEntry" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinanceJournalLine_glAccountId_fkey"
        FOREIGN KEY ("glAccountId") REFERENCES "FinanceCategory" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FinanceJournalEntry_familyId_idx"         ON "FinanceJournalEntry"("familyId");
CREATE INDEX "FinanceJournalEntry_familyId_date_idx"    ON "FinanceJournalEntry"("familyId", "date" DESC);
CREATE INDEX "FinanceJournalEntry_familyId_isPosted_idx" ON "FinanceJournalEntry"("familyId", "isPosted");
CREATE INDEX "FinanceJournalEntry_entityId_idx"         ON "FinanceJournalEntry"("entityId");
CREATE INDEX "FinanceJournalEntry_reversalOfId_idx"     ON "FinanceJournalEntry"("reversalOfId");
CREATE INDEX "FinanceJournalLine_journalEntryId_idx"    ON "FinanceJournalLine"("journalEntryId");
CREATE INDEX "FinanceJournalLine_glAccountId_idx"       ON "FinanceJournalLine"("glAccountId");
