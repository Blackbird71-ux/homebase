# PIN Security Fixes, Email Reset, and Help Content Update

**Date:** 2026-05-06

## Summary

Implemented PIN security bug fixes, PIN reset via email with UI-managed SMTP configuration, and updated contextual help content.

## Changes

### Bug Fixes — PIN Toggle Security

| File | Change |
|------|--------|
| `src/app/api/documents/[id]/route.ts` | Removed `pinHash: undefined` from GET response so edit dialog correctly detects existing PIN |
| `src/components/documents/DocumentCard.tsx` | Changed `body.pin = null` to `body.pin = undefined` when toggle is off |
| `src/app/api/contacts/[id]/route.ts` | Only clears PIN on explicit `null`, not on empty string |
| `src/app/(app)/contacts/ContactsClient.tsx` | Changed `body.pin = ''` to `body.pin = undefined` when toggle is off |

### PIN Reset via Email

| File | Description |
|------|-------------|
| `src/lib/email.ts` | Nodemailer utility reading SMTP config from admin's `uiPreferences` |
| `src/lib/pin-reset-token.ts` | HMAC-signed tokens using ENCRYPTION_KEY (no DB migration) |
| `src/app/api/pin-reset/request/route.ts` | POST endpoint generating token and sending email |
| `src/app/api/pin-reset/confirm/route.ts` | POST endpoint verifying token and updating pinHash |
| `src/app/(app)/reset-pin/page.tsx` | Client page with PIN entry form |
| `src/components/shared/SecureUnlockDialog.tsx` | Added "Forgot PIN?" link after 3 failed attempts |

### UI-Managed Email Settings

| File | Description |
|------|-------------|
| `src/components/settings/EmailTab.tsx` | Full SMTP config form with test email feature |
| `src/app/api/settings/email/test/route.ts` | Test email endpoint (admin-only) |
| `src/app/(app)/settings/page.tsx` | Added Email tab (admin-only) |

### Lock-on-Navigate-Away for Secure Items

| File | Change |
|------|--------|
| `src/app/api/notes/[id]/lock/route.ts` | **New** — POST endpoint that clears the unlock cookie for notes |
| `src/app/api/documents/[id]/lock/route.ts` | **New** — POST endpoint that clears the unlock cookie for documents |
| `src/app/api/contacts/[id]/lock/route.ts` | **New** — POST endpoint that clears the unlock cookie for contacts |
| `src/app/(app)/notes/[id]/NoteDetail.tsx` | Added `beforeunload` listener (sendBeacon) + useEffect cleanup to lock on navigate away/refresh; added Lock button in header |
| `src/app/(app)/contacts/ContactsClient.tsx` | Added `beforeunload` listener (sendBeacon for all unlocked contacts) + useEffect cleanup; added Lock buttons in hover actions and card body |
| `src/components/documents/DocumentCard.tsx` | Added unlock/lock state, `SecureUnlockDialog`, `beforeunload` listener + useEffect cleanup; "Unlock to Download" button for locked secured docs; Lock button for unlocked secured docs |
| `src/app/api/documents/[id]/download/route.ts` | Added server-side unlock cookie check — returns 403 if document is PIN-protected and not unlocked |

### Help Content Updates

| File | Description |
|------|-------------|
| `src/components/layout/HelpContent.ts` | Updated with sections for PIN protection, tabbed notes, drag-and-drop meal plan, document expiry tracking, email config, secure card appearance, tag/category colors, Apple Pro theme, audit log backup |

## New Dependencies

- `nodemailer` — Email sending
- `@types/nodemailer` — TypeScript types

## Environment Variables

No new environment variables required. SMTP settings are stored in the admin user's `uiPreferences` JSON field. PIN reset tokens use the existing `ENCRYPTION_KEY` env var.

## Testing

1. Verify PIN toggle state is preserved when editing documents/contacts
2. Verify PIN cannot be cleared without entering it first
3. Configure SMTP in Settings → Email (admin only)
4. Use "Test Email" to verify configuration
5. Test PIN reset flow: enter wrong PIN 3 times → click "Forgot PIN?" → enter email → receive reset link → set new PIN
