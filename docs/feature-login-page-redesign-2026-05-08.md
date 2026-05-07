# Feature: Login Page Redesign + Customisable Tagline

**Date:** 2026-05-08  
**Status:** Shipped

## What Changed

The login page was redesigned to match a cleaner, editorial style and gained a customisable tagline settable by admins.

### Visual redesign

- **No card** — content floats directly on `bg-background` (previously wrapped in a bordered card)
- **Logo lockup** — House icon (Lucide) in a `bg-foreground` rounded square + "Homebase" text, top of the content block
- **Large serif heading** — "Welcome home." in `font-serif` at `text-5xl`
- **Muted subtitle** — customisable tagline beneath the heading
- **Streamlined links** — "Forgot?" sits inline with the Password label; "New here? Create your family →" appears below the password field; the old bottom-of-page "Need an account?" paragraph is removed
- **Sign in button** — full-width `h-10` with "Sign in ›" text
- **Version footer** — "v3.2 · Made for households, not teams." at the bottom of the content block

### Theme awareness

The page uses only semantic CSS variable tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-foreground`, `text-background`). next-themes persists the user's chosen theme to localStorage, so the login page automatically reflects whichever theme was last active — including all 21 preset themes and any advanced custom colours.

### Customisable tagline

Admins can edit the subtitle in **Settings → General → Login page tagline** (max 200 characters). Clearing the field reverts to the default: *"The calm command centre for the people who share your roof."*

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `loginTagline String?` to `Family` model |
| `prisma/migrations/20260508000000_add_login_tagline/migration.sql` | `ALTER TABLE "Family" ADD COLUMN "loginTagline" TEXT` |
| `src/app/login/page.tsx` | Full redesign as async server component; reads tagline from DB via Prisma |
| `src/app/login/LoginForm.tsx` | New client component extracted from page.tsx |
| `src/app/api/settings/family/route.ts` | GET/PATCH include `loginTagline` |
| `src/app/(app)/settings/general/page.tsx` | Passes `loginTagline` to `FamilySettingsClient` |
| `src/app/(app)/settings/general/FamilySettingsClient.tsx` | Textarea field for tagline (admin only) |

## Deployment Notes

Migration runs automatically on container start via `docker/entrypoint.sh`. No manual step required on the NAS.
