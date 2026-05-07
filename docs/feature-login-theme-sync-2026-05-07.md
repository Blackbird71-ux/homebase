# Feature: Login Screen Reflects Household Theme

**Date:** 2026-05-07  
**Status:** Shipped

## What Changed

The login page (and all pre-auth pages) now display the same theme the household has configured in Settings, instead of always defaulting to the dark/black theme.

### Problem

`ThemeSyncer` runs on every page load and calls `/api/settings` to apply the user's saved theme. On pre-auth pages (login, forgot-password, register, reset-password) there is no session, so `/api/settings` returns a non-OK response and the syncer returned early — leaving next-themes at its `defaultTheme="dark"` (near-black). After login the correct theme snapped in, but the login page itself always looked black regardless of the household's settings.

### Fix

Two changes:

1. **New public endpoint** `GET /api/public/theme` — requires no authentication. Reads `theme` from the first user in the database and returns `{ theme: string }`. Falls back to `"dark"` on any error.

2. **ThemeSyncer fallback** — when `/api/settings` returns non-OK, ThemeSyncer now calls `/api/public/theme` and applies whatever theme it returns, so the login page inherits the household's configured theme.

The public endpoint exposes only the theme name (e.g. `"ocean"`, `"forest"`) — no user data.

### Limitations

Advanced custom colour overrides (sidebar, calendar, card colours set in the Advanced Theming tab) still only apply after login. The login page uses the named theme class only, which covers background, foreground, and all standard semantic tokens — more than sufficient for the login screen.

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/public/theme/route.ts` | New — unauthenticated GET endpoint returning the household theme |
| `src/components/providers/ThemeProvider.tsx` | ThemeSyncer falls back to `/api/public/theme` when unauthenticated |
