# Forgot Password — Self-Service Email Reset

**Date:** 2026-05-07

## Summary

Added a self-service password reset flow to the login screen. Users can request a reset link via email, which expires after 1 hour. No database migration required — tokens are HMAC-signed and self-contained, using the existing `ENCRYPTION_KEY`.

## Changes

| File | Description |
|------|-------------|
| `src/lib/password-reset-token.ts` | **New** — HMAC-SHA256 signed token generation and verification (1-hour expiry, reuses `ENCRYPTION_KEY`) |
| `src/lib/email-templates.ts` | Added `passwordResetHtml()` — styled HTML email with reset button, matching existing template layout |
| `src/app/api/password-reset/request/route.ts` | **New** — POST endpoint: looks up user by email, generates token, sends reset email. Always returns success to prevent email enumeration |
| `src/app/api/password-reset/confirm/route.ts` | **New** — POST endpoint: verifies token, hashes new password with bcrypt (12 rounds), updates user record |
| `src/app/forgot-password/page.tsx` | **New** — Email entry form; shows "check your inbox" confirmation after submission |
| `src/app/reset-password/page.tsx` | **New** — Password + confirm form; reads `?token=` from URL; redirects to `/login?reset=1` on success |
| `src/app/login/page.tsx` | Added "Forgot password?" link next to password label; shows green success banner when `?reset=1` is present |

## Flow

1. User clicks **Forgot password?** on the login screen
2. Enters their email on `/forgot-password`
3. If the email matches an account, a reset link is emailed (link valid for 1 hour)
4. User clicks link → `/reset-password?token=…`
5. Enters and confirms a new password (min 8 characters)
6. On success, redirected to `/login?reset=1` with a confirmation banner

## Security Notes

- Email enumeration is prevented — the request endpoint always returns `{ success: true }` regardless of whether the email exists
- Tokens are HMAC-signed with `ENCRYPTION_KEY` and encode expiry; they cannot be forged or extended without the key
- Passwords are hashed with bcrypt at 12 rounds, consistent with the rest of the auth system

## Prerequisites

SMTP must be configured in **Settings → Email** (admin only) for reset emails to be delivered. If SMTP is not set up, the token is generated but the email silently fails — same behaviour as PIN reset.

## Environment Variables

No new variables required. Uses existing `ENCRYPTION_KEY`, `AUTH_URL` / `NEXTAUTH_URL`.
