-- Add isSystemAdmin to User and isAdminInvite to InviteCode
ALTER TABLE "User" ADD COLUMN "isSystemAdmin" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "InviteCode" ADD COLUMN "isAdminInvite" BOOLEAN NOT NULL DEFAULT 0;
