# Feature: Bi-Monthly Bill Frequency (2026-05-12)

Adds **Bi-Monthly** (every 2 months, 6× per year) as a selectable frequency for recurring bills.

## Changes

### `src/app/(app)/finance/bills/page.tsx`
- Added `bimonthly` option to the frequency dropdown (between Monthly and Quarterly).
- `toMonthlyAmount`: divides by 2 for `bimonthly`; also added missing `halfyearly` case (÷ 6).
- `getNextDue`: advances by 2 months for `bimonthly`; also added missing `halfyearly` case (+6 months).

### `src/lib/financeShared.ts`
- `timesPerMonth`: added `bimonthly` → `1/2`.

## Frequency Reference

| Value        | Label       | Times/year | Monthly multiplier |
|-------------|-------------|-----------|-------------------|
| `weekly`    | Weekly      | 52        | × 52/12           |
| `fortnightly` | Fortnightly | 26      | × 26/12           |
| `monthly`   | Monthly     | 12        | × 1               |
| `bimonthly` | Bi-Monthly  | 6         | ÷ 2               |
| `quarterly` | Quarterly   | 4         | ÷ 3               |
| `halfyearly` | Half-Yearly | 2        | ÷ 6               |
| `yearly`    | Yearly      | 1         | ÷ 12              |
