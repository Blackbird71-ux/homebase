-- CreateTable
CREATE TABLE "HomeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "serialNumber" TEXT,
    "purchaseDate" DATETIME,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HomeAsset_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "cost" REAL,
    "odometer" INTEGER,
    "notes" TEXT,
    "nextDueDate" DATETIME,
    "nextDueOdometer" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "HomeAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HomeAsset_familyId_idx" ON "HomeAsset"("familyId");

-- CreateIndex
CREATE INDEX "HomeAsset_familyId_isActive_idx" ON "HomeAsset"("familyId", "isActive");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_assetId_idx" ON "MaintenanceRecord"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_familyId_idx" ON "MaintenanceRecord"("familyId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_familyId_nextDueDate_idx" ON "MaintenanceRecord"("familyId", "nextDueDate");
