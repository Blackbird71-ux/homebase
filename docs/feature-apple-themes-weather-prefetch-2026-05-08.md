# Apple Theme Variants + Weather Dialog Prefetch — 2026-05-08

## Apple Theme Variants

Added five new apple-family theme options to the settings API allowlist:

- `apple-aqua`
- `apple-graphite`
- `apple-sunset`
- `apple-midnight`
- `apple-forest`

**File:** `src/app/api/settings/route.ts`

## Weather Dialog Prefetch Support

`WeatherDialog` now accepts optional prefetched props so the dialog can show weather data immediately on open without waiting for a fresh fetch:

- `prefetchedWeather`, `prefetchedLoading`, `prefetchedError`, `prefetchedNeedsConfig`, `prefetchedGeoError`
- State initialises from prefetched values; `hasAttempted` is set to `true` up front so the live fetch is skipped when prefetched data is present
- On dialog close the state still resets as before

**File:** `src/components/dashboard/WeatherDialog.tsx`

## Advanced Theming Removal

Removed the Advanced Theming section (custom color overrides UI) from the Appearance settings tab — it was a regression. The `AdvancedThemeProvider` infrastructure additions (layout wrapper, event listener) were also discarded in full.

**Files reverted:** `src/app/(app)/settings/page.tsx`, `src/app/layout.tsx`, `src/components/providers/AdvancedThemeProvider.tsx`
