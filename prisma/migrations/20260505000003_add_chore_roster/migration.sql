-- Create Chore model for recurring household tasks
CREATE TABLE IF NOT EXISTS "Chore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',  -- daily | weekly | biweekly | monthly
    "dayOfWeek" INTEGER,  -- 0=Sunday, 1=Monday, etc. (for weekly)
    "dayOfMonth" INTEGER, -- 1-31 (for monthly)
    "rotationInterval" INTEGER NOT NULL DEFAULT 1, -- rotate every N intervals
    "currentAssigneeId" TEXT,
    "familyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chore_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE,
    CONSTRAINT "Chore_currentAssigneeId_fkey" FOREIGN KEY ("currentAssigneeId") REFERENCES "User" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Chore_familyId_idx" ON "Chore"("familyId");
CREATE INDEX IF NOT EXISTS "Chore_currentAssigneeId_idx" ON "Chore"("currentAssigneeId");

-- Create ChoreCompletion model for tracking completions
CREATE TABLE IF NOT EXISTS "ChoreCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "choreId" TEXT NOT NULL,
    "completedById" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "ChoreCompletion_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore" ("id") ON DELETE CASCADE,
    CONSTRAINT "ChoreCompletion_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChoreCompletion_choreId_idx" ON "ChoreCompletion"("choreId");
CREATE INDEX IF NOT EXISTS "ChoreCompletion_completedById_idx" ON "ChoreCompletion"("completedById");
CREATE INDEX IF NOT EXISTS "ChoreCompletion_completedAt_idx" ON "ChoreCompletion"("completedAt");
