-- CreateTable: TripAttachment
-- Stores file attachments at trip or day level (invoices, bookings, tickets, etc.)
-- These are stored separately from the Document Vault.

CREATE TABLE "TripAttachment" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "tripId"       TEXT NOT NULL,
    "dayId"        TEXT,
    "familyId"     TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "fileName"     TEXT NOT NULL,
    "fileSize"     INTEGER NOT NULL DEFAULT 0,
    "mimeType"     TEXT NOT NULL DEFAULT 'application/octet-stream',
    "uploadedById" TEXT NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripAttachment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripAttachment_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TripDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TripAttachment_tripId_idx"   ON "TripAttachment"("tripId");
CREATE INDEX "TripAttachment_dayId_idx"    ON "TripAttachment"("dayId");
CREATE INDEX "TripAttachment_familyId_idx" ON "TripAttachment"("familyId");
