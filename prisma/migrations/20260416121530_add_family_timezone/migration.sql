-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "umamiScriptUrl" TEXT,
    "umamiSiteId" TEXT
);
INSERT INTO "new_Family" ("id", "name", "umamiScriptUrl", "umamiSiteId") SELECT "id", "name", "umamiScriptUrl", "umamiSiteId" FROM "Family";
DROP TABLE "Family";
ALTER TABLE "new_Family" RENAME TO "Family";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
