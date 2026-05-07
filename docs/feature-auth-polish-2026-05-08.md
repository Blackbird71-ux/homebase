# Feature: Auth Page Polish + Login Page Settings Tab

**Date:** 2026-05-08  
**Status:** Shipped

## What Changed

### Login page centred

The outer flex container gained `items-center` so the content block is now centred horizontally on the screen (previously left-aligned with heavy left padding).

### Consistent icon lockup across all auth screens

Forgot-password, register, and reset-password pages previously used the `🏠` emoji as their header. All three now use the same icon lockup as the login page: a `House` icon (Lucide) inside a `size-9 rounded-lg bg-foreground text-background` pill, followed by the "Homebase" wordmark. The treatment is theme-aware — it inverts cleanly across dark, midnight, high-contrast, and all other themes.

| Page | Before | After |
|------|--------|-------|
| `/login` | House icon (correct, but not centred) | Centred ✓ |
| `/forgot-password` | `🏠 Homebase` emoji | House icon lockup ✓ |
| `/register` | `🏠 Homebase` emoji | House icon lockup ✓ |
| `/reset-password` | `🏠 Homebase` emoji | House icon lockup ✓ |

### Login page settings tab

A new admin-only **"Login page"** tab was added to Settings. It exposes two fields previously buried or hardcoded:

- **Tagline** — the subtitle shown below "Welcome home." on the sign-in screen (was already stored in DB but only reachable via the unlisted `/settings/general` route)
- **Version label** — the `vX.X` string shown in the login page footer (was hardcoded as `v3.2`; now stored in `Family.appVersion` and editable without a redeploy)

### DB change

`appVersion String?` added to the `Family` model. Migration runs automatically on container start.

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `appVersion String?` to `Family` model |
| `prisma/migrations/20260508110000_add_app_version/migration.sql` | `ALTER TABLE "Family" ADD COLUMN "appVersion" TEXT` |
| `src/app/login/page.tsx` | Centred layout; reads `appVersion` from DB; defaults to `3.2` |
| `src/app/forgot-password/page.tsx` | House icon lockup replacing emoji |
| `src/app/register/page.tsx` | House icon lockup replacing emoji |
| `src/app/reset-password/page.tsx` | House icon lockup replacing emoji |
| `src/app/api/settings/family/route.ts` | GET/PATCH include `appVersion` (max 20 chars) |
| `src/app/(app)/settings/page.tsx` | Admin-only "Login page" tab; fetches `loginTagline` + `appVersion` |
| `src/components/settings/LoginPageTab.tsx` | New client component — tagline + version inputs |

## Deployment Notes

Migration runs automatically on container start. No manual step required on the NAS.
