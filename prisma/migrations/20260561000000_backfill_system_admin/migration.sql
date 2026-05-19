-- Backfill: the first-ever registered admin user should have isSystemAdmin=1.
-- The column was added with DEFAULT 0, so existing users were not promoted.
-- Only runs if no system admin currently exists (safe to re-apply).
UPDATE "User"
SET "isSystemAdmin" = 1
WHERE id = (
  SELECT id FROM "User"
  WHERE role = 'admin'
  ORDER BY createdAt ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "User" WHERE "isSystemAdmin" = 1
);
