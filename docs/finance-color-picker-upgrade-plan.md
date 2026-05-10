# Finance Color Picker Upgrade Plan

## Current State

### Existing [`ColorPicker`](src/components/ui/color-picker.tsx) component
- A reusable component used by `CategoryManager`, `TagManager`, and `AdvancedThemingTab`
- Has a color swatch preview, hex text input, and a native `<input type="color">` triggered by a palette button
- **Lacks a pre-selected color palette/swatch row** — users must manually type a hex code or use the native OS color picker

### Finance modals with color fields
All 4 modals currently use bare `<input type="color">` with **no preset palette**:

| Page | File | Current Color UI | Default Color |
|------|------|-----------------|---------------|
| Categories | [`categories/page.tsx:200-209`](src/app/(app)/finance/categories/page.tsx:200) | `<input type="color">` + hex text | `#6366F1` |
| Accounts | [`accounts/page.tsx:126-129`](src/app/(app)/finance/accounts/page.tsx:126) | `<input type="color">` only | `#6366F1` |
| Locations | [`locations/page.tsx:96-99`](src/app/(app)/finance/locations/page.tsx:96) | `<input type="color">` only | `#10B981` |
| Goals | [`goals/page.tsx:135-138`](src/app/(app)/finance/goals/page.tsx:135) | `<input type="color">` only | `#10B981` |

### Reference implementation: Entities page
The Entities modal ([`entities/page.tsx:228-241`](src/app/(app)/finance/entities/page.tsx:228)) already has a great color picker UX — a row of 15 preset color swatches + a native color picker for custom colors. This is the pattern to replicate.

## Proposed Solution

### Step 1: Enhance [`ColorPicker`](src/components/ui/color-picker.tsx) component

Add a `presetColors` prop (optional, with a sensible default palette) that renders a row of clickable color swatches above the existing input/native picker.

**Preset color palette** (consistent with Entities already):
```
#6366F1  #8B5CF6  #EC4899  #F97316  #EAB308
#22C55E  #14B8A6  #3B82F6  #F43F5E  #A855F7
#64748B  #0EA5E9  #D97706  #16A34A  #DC2626
```

**UI pattern** (per Entities reference):
```tsx
{showPresets && (
  <div className="flex items-center gap-1.5 flex-wrap">
    {presetColors.map(c => (
      <button key={c} type="button" onClick={() => onChange(c)}
        className={cn('w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
          value === c ? 'border-foreground scale-110' : 'border-transparent')}
        style={{ backgroundColor: c }} title={c} />
    ))}
    <input type="color" value={value}
      onChange={e => onChange(e.target.value)}
      className="w-6 h-6 rounded cursor-pointer border border-input" title="Custom colour" />
  </div>
)}
```

The component should:
- Accept optional `presetColors` prop (string[]), defaulting to the palette above
- Accept optional `showPresets` boolean prop (default true)
- Render swatches as small circular buttons (w-6 h-6)
- Highlight the currently selected color with `border-foreground`
- Keep all existing functionality (hex input, native picker, disabled state)

### Step 2-5: Update each finance modal

Replace the bare `<input type="color">` in each modal with the enhanced [`ColorPicker`](src/components/ui/color-picker.tsx):

| Page | Lines to replace | Change |
|------|-----------------|--------|
| [`categories/page.tsx`](src/app/(app)/finance/categories/page.tsx) | 199-209 | Replace color `<div>` with `<ColorPicker>` |
| [`accounts/page.tsx`](src/app/(app)/finance/accounts/page.tsx) | 125-129 | Replace color `<div>` with `<ColorPicker>` |
| [`locations/page.tsx`](src/app/(app)/finance/locations/page.tsx) | 95-99 | Replace color `<div>` with `<ColorPicker>` |
| [`goals/page.tsx`](src/app/(app)/finance/goals/page.tsx) | 134-138 | Replace color `<div>` with `<ColorPicker>` |

**Example replacement:**
```tsx
// BEFORE:
<div>
  <label className="text-xs text-muted-foreground">Color</label>
  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
    className="h-8 w-8 rounded cursor-pointer" />
</div>

// AFTER:
<div>
  <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
  <ColorPicker
    value={form.color}
    onChange={newColor => setForm(p => ({ ...p, color: newColor }))}
  />
</div>
```

For the **Categories modal**, the separate hex text preview can be removed (it's now shown inside the ColorPicker component).

### Step 6: Verify consistency
- All 4 modals + Entities should have the same color picking experience
- The existing ColorPicker consumers (CategoryManager, TagManager, AdvancedThemingTab) benefit automatically from the palette
- Swatches should be keyboard accessible
- Dark/light theme compatibility maintained

## Files to modify

| # | File | Action |
|---|------|--------|
| 1 | [`src/components/ui/color-picker.tsx`](src/components/ui/color-picker.tsx) | **Enhance** — add preset color palette |
| 2 | [`src/app/(app)/finance/categories/page.tsx`](src/app/(app)/finance/categories/page.tsx) | **Update** — replace native input with ColorPicker |
| 3 | [`src/app/(app)/finance/accounts/page.tsx`](src/app/(app)/finance/accounts/page.tsx) | **Update** — replace native input with ColorPicker |
| 4 | [`src/app/(app)/finance/locations/page.tsx`](src/app/(app)/finance/locations/page.tsx) | **Update** — replace native input with ColorPicker |
| 5 | [`src/app/(app)/finance/goals/page.tsx`](src/app/(app)/finance/goals/page.tsx) | **Update** — replace native input with ColorPicker |

## What stays the same (unchanged)
- The Entities page — already has the palette pattern, no changes needed
- Bills, Income, Transactions, Vendors, Members, Budget, Reports pages — no direct color field on their entities
- All existing ColorPicker consumers benefit from the palette automatically
