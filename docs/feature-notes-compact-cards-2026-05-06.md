# Feature: Condensed Notes Card Layout

**Date:** 2026-05-06

## Summary

Reduced vertical padding on note cards and page layout to allow more notes to be visible on screen at all viewport sizes.

## Changes Made

### `src/components/notes/NoteCard.tsx`

- **CardHeader**: `p-6 pb-2` → `p-3 pb-1` — tighter top/left/right padding
- **CardTitle**: `text-base` → `text-sm` — smaller title font
- **Badges** (Secure/Private/Family/New): `text-xs` → `text-[10px]` with tighter padding (`px-1.5 py-0.5` instead of `px-2 py-0.5`/`px-2 py-1`)
- **Metadata row**: Removed `mt-1`, reduced gap from `gap-3` to `gap-2`, smaller icons (`h-2.5 w-2.5` instead of `h-3 w-3`)
- **CardContent**: `gap-3` → `gap-1.5`, `px-6 pb-6` → `px-3 pb-3`
- **Content preview**: `text-sm line-clamp-3` → `text-xs line-clamp-2`
- **Tags**: `gap-1` → `gap-0.5`, smaller text (`text-[10px]`) and padding (`px-1.5 py-0.5`)

### `src/app/(app)/notes/NotesClient.tsx`

- **Outer container**: `p-4 md:p-6 gap-6` → `p-3 md:p-4 gap-4`
- **Grid gap**: `gap-4` → `gap-3`

## Impact

- Saves approximately 25–35px per note card
- Allows 1–2 additional note cards visible above the fold at any viewport size
- All view sizes benefit (mobile single-column, tablet two-column, desktop three-column)
