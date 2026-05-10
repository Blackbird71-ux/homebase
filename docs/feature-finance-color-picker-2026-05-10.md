# Finance Color Picker — Preset Palette Swatches

## Overview

Added a pre-selected color palette to all finance modals that have a colour field, making it much faster to pick commonly-used colours. The implementation reuses and enhances the existing [`ColorPicker`](src/components/ui/color-picker.tsx) component.

## Changes

### [`ColorPicker`](src/components/ui/color-picker.tsx) — enhanced
- Added a **preset colour swatch row** (15 colours) rendered as clickable circular buttons
- Added a **custom colour button** at the end of the row that opens the native OS colour picker
- New optional props:
  - `presetColors?: string[]` — custom palette array (defaults to `DEFAULT_PRESET_COLORS`)
  - `showPresets?: boolean` — toggle the swatch row (defaults to `true`)
- Exported `DEFAULT_PRESET_COLORS` constant for reuse
- Active swatch is highlighted with `border-foreground` + ring + slight scale
- All existing consumers (`CategoryManager`, `TagManager`, `AdvancedThemingTab`) get the palette automatically

### Finance modals updated

All 4 pages that previously used bare `<input type="color">` now use the enhanced `ColorPicker`:

| Page | File | What changed |
|------|------|-------------|
| Categories | [`categories/page.tsx:198`](src/app/(app)/finance/categories/page.tsx:198) | Replaced native `<input type="color">` + hex text with `<ColorPicker>` |
| Accounts | [`accounts/page.tsx:129`](src/app/(app)/finance/accounts/page.tsx:129) | Replaced native `<input type="color">` with `<ColorPicker>` |
| Locations | [`locations/page.tsx:99`](src/app/(app)/finance/locations/page.tsx:99) | Replaced native `<input type="color">` with `<ColorPicker>` |
| Goals | [`goals/page.tsx:138`](src/app/app)/finance/goals/page.tsx:138) | Replaced native `<input type="color">` with `<ColorPicker>` |

### Preset Colour Palette

```
#6366F1  #8B5CF6  #EC4899  #F97316  #EAB308
#22C55E  #14B8A6  #3B82F6  #F43F5E  #A855F7
#64748B  #0EA5E9  #D97706  #16A34A  #DC2626
```

The Entities page ([`entities/page.tsx:228`](src/app/(app)/finance/entities/page.tsx:228)) already had an inline palette matching these colours — it remains unchanged.

## Files Modified

| # | File | Action |
|---|------|--------|
| 1 | [`src/components/ui/color-picker.tsx`](src/components/ui/color-picker.tsx) | Enhanced — added preset colour palette |
| 2 | [`src/app/(app)/finance/categories/page.tsx`](src/app/(app)/finance/categories/page.tsx) | Updated — replaced bare `<input type="color">` with `<ColorPicker>` |
| 3 | [`src/app/(app)/finance/accounts/page.tsx`](src/app/(app)/finance/accounts/page.tsx) | Updated — replaced bare `<input type="color">` with `<ColorPicker>` |
| 4 | [`src/app/(app)/finance/locations/page.tsx`](src/app/(app)/finance/locations/page.tsx) | Updated — replaced bare `<input type="color">` with `<ColorPicker>` |
| 5 | [`src/app/(app)/finance/goals/page.tsx`](src/app/(app)/finance/goals/page.tsx) | Updated — replaced bare `<input type="color">` with `<ColorPicker>` |

## Verification

- TypeScript compilation: clean (no new errors)
- Next.js production build: compiled successfully in 7.4s
- All finance routes listed correctly in build output
