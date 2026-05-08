-- CreateTable: BillAttachment
-- Stores invoice PDFs and reference documents attached to a bill.
-- These are private to the bill and do NOT appear in the Document Vault.

CREATE TABLE "BillAttachment" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "billId"       TEXT NOT NULL,
    "familyId"     TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "fileSize"     INTEGER NOT NULL DEFAULT 0,
    "mimeType"     TEXT NOT NULL DEFAULT 'application/octet-stream',
    "uploadedById" TEXT NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillAttachment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "FinanceRecurringBill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BillAttachment_billId_idx"   ON "BillAttachment"("billId");
CREATE INDEX "BillAttachment_familyId_idx" ON "BillAttachment"("familyId");
