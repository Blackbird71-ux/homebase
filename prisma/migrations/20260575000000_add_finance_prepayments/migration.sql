-- Prepaid-and-amortise support (forensic audit Finding F3).
--
-- A material prepayment (net ≥ Family.prepaymentThreshold AND coverage spans
-- more than one month) is capitalised to the "Prepaid Expenses" current-asset
-- account at the tax point, then amortised to the expense account over the
-- coverage period. Each scheduled period is an individually postable journal
-- entry (manual "Post" — no cron). See src/lib/finance-prepayment.ts.

-- Materiality knob (configurable per family; not hardcoded). Existing families
-- inherit the AUD 300 default.
ALTER TABLE "Family" ADD COLUMN "prepaymentThreshold" REAL NOT NULL DEFAULT 300;

-- Coverage span override on the bill. Null ⇒ auto-derive from frequency at
-- receipt; set both to correct the amortisation span.
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "coverageStart" DATETIME;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "coverageEnd"   DATETIME;

-- CreateTable: FinancePrepaymentSchedule
CREATE TABLE "FinancePrepaymentSchedule" (
    "id"               TEXT     NOT NULL PRIMARY KEY,
    "familyId"         TEXT     NOT NULL,
    "billId"           TEXT,
    "prepaidAccountId" TEXT     NOT NULL,
    "expenseAccountId" TEXT     NOT NULL,
    "description"      TEXT     NOT NULL,
    "totalNet"         REAL     NOT NULL,
    "coverageStart"    DATETIME NOT NULL,
    "coverageEnd"      DATETIME NOT NULL,
    "periodCount"      INTEGER  NOT NULL,
    "status"           TEXT     NOT NULL DEFAULT 'active',
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancePrepaymentSchedule_familyId_fkey"
        FOREIGN KEY ("familyId") REFERENCES "Family" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancePrepaymentSchedule_billId_fkey"
        FOREIGN KEY ("billId") REFERENCES "FinanceRecurringBill" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancePrepaymentSchedule_prepaidAccountId_fkey"
        FOREIGN KEY ("prepaidAccountId") REFERENCES "FinanceCategory" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancePrepaymentSchedule_expenseAccountId_fkey"
        FOREIGN KEY ("expenseAccountId") REFERENCES "FinanceCategory" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: FinancePrepaymentScheduleLine
CREATE TABLE "FinancePrepaymentScheduleLine" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "scheduleId"     TEXT     NOT NULL,
    "periodIndex"    INTEGER  NOT NULL,
    "periodDate"     DATETIME NOT NULL,
    "amount"         REAL     NOT NULL,
    "posted"         BOOLEAN  NOT NULL DEFAULT false,
    "journalEntryId" TEXT,
    "postedAt"       DATETIME,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancePrepaymentScheduleLine_scheduleId_fkey"
        FOREIGN KEY ("scheduleId") REFERENCES "FinancePrepaymentSchedule" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancePrepaymentScheduleLine_journalEntryId_fkey"
        FOREIGN KEY ("journalEntryId") REFERENCES "FinanceJournalEntry" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FinancePrepaymentSchedule_familyId_idx"         ON "FinancePrepaymentSchedule"("familyId");
CREATE INDEX "FinancePrepaymentSchedule_familyId_status_idx"  ON "FinancePrepaymentSchedule"("familyId", "status");
CREATE INDEX "FinancePrepaymentSchedule_billId_idx"           ON "FinancePrepaymentSchedule"("billId");
CREATE INDEX "FinancePrepaymentScheduleLine_scheduleId_idx"   ON "FinancePrepaymentScheduleLine"("scheduleId");
CREATE INDEX "FinancePrepaymentScheduleLine_journalEntryId_idx" ON "FinancePrepaymentScheduleLine"("journalEntryId");
