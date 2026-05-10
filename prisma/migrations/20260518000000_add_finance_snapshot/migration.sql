-- FinanceSnapshot: stores monthly YTD report payloads
CREATE TABLE "finance_snapshots" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "financialYear"  TEXT     NOT NULL,
    "snapshotMonth"  INTEGER  NOT NULL,
    "snapshotYear"   INTEGER  NOT NULL,
    "periodLabel"    TEXT     NOT NULL,
    "monthsComplete" INTEGER  NOT NULL DEFAULT 0,
    "reportJson"     TEXT     NOT NULL,
    "familyId"       TEXT     NOT NULL,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_snapshots_familyId_fkey"
        FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "finance_snapshots_family_fy_month_year_key"
    ON "finance_snapshots"("familyId", "financialYear", "snapshotMonth", "snapshotYear");
CREATE INDEX "finance_snapshots_familyId_financialYear_idx"
    ON "finance_snapshots"("familyId", "financialYear");

-- ReportEmail: log of emails sent for each snapshot
CREATE TABLE "report_emails" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "snapshotId"     TEXT     NOT NULL,
    "recipientEmail" TEXT     NOT NULL,
    "subject"        TEXT     NOT NULL,
    "status"         TEXT     NOT NULL DEFAULT 'pending',
    "errorMessage"   TEXT,
    "sentAt"         DATETIME,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_emails_snapshotId_fkey"
        FOREIGN KEY ("snapshotId") REFERENCES "finance_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "report_emails_snapshotId_idx" ON "report_emails"("snapshotId");
