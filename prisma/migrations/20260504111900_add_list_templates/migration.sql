-- CreateTable
CREATE TABLE "ListTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListTemplate_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListTemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ListTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ListTemplate_familyId_idx" ON "ListTemplate"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "ListTemplate_familyId_name_key" ON "ListTemplate"("familyId", "name");

-- CreateIndex
CREATE INDEX "ListTemplateItem_templateId_idx" ON "ListTemplateItem"("templateId");
