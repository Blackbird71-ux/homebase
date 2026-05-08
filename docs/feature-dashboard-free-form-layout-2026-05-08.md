# Feature: Free-Form Dashboard Card Layout (Drag & Resize)
**Date:** May 8, 2026

## Summary
Replaced the rigid flex-based 2-column dashboard layout with a free-form, absolute-positioned card layout system. Users can now drag cards to reposition them, resize from any edge/corner, toggle between half/full width, with collision push-down and debounced persistence to the server.

## Changes

### 1. Free-Form Card Layout Hook (`useCardLayout`)
- **New hook** managing all layout state and interaction logic:
  - **Drag to move:** Pointer Events API (`pointerdown` on drag handle, window-level `pointermove`/`pointerup`). DeltaX converted to percentage, deltaY as percentage (auto-height cards) or pixels (fixed-height cards). Clamped to container bounds with min-width 25%.
  - **Drag to resize:** 8-direction edge/corner handles. Width clamped to 25%-100%, height minimum 150px. East/west edges resize width, north/south resize height, corners resize both.
  - **Toggle width:** Button in each card header toggles between 48% (half) and 100% (full width). Collision resolution runs after toggle.
  - **Collision push-down:** After move/resize/toggle, overlapping cards are pushed downward with a 16px gap. Uses cascading push (up to 50 iterations) to resolve chains.
  - **Auto-positioning:** Cards without saved layouts are placed full-width (`width: 100`, `x: 0`) stacked vertically (`y = index * 416px`, `height: 'auto'`). y is always stored in pixels.
  - **Persistence:** Debounced 500ms save via `onSave` callback.
  - **Reset:** `resetLayouts()` clears all layouts back to full-width defaults; exposed via `forwardRef`/`useImperativeHandle` on `DashboardGrid`.
- **File:** `src/lib/hooks/useCardLayout.ts`
  - Exports: `useCardLayout`, `CardLayoutMap`, `MIN_WIDTH_PCT`

### 2. DashboardCardWrapper
- Absolute-positioned card container that computes pixel positions from percentage-based layout:
  - `leftPx = (x/100) * containerWidth`
  - `widthPx = (width/100) * containerWidth`
  - `topPx` varies: percentage for auto-height, pixels for fixed-height
  - `height` is 'auto' or pixel value
- Renders:
  - **Drag handle** (GripVertical icon, `h-8` top bar, `cursor-grab active:cursor-grabbing`)
  - **Toggle button** (Maximize2/Minimize2, top-right corner)
  - **Content area** with `pt-8 overflow-auto h-full` for card children
  - **8 ResizeHandles** on all edges/corners
- Elevated z-index during drag (50) / resize (40)
- Visual feedback: `shadow-xl ring-2 ring-primary/20` while dragging, `shadow-lg ring-1 ring-primary/10` while resizing
- **File:** `src/components/dashboard/DashboardCardWrapper.tsx` (NEW — 122 lines)

### 3. ResizeHandle
- 8-direction handle component with:
  - Corner handles (se/sw/ne/nw): `h-3 w-3`, visible circular grip on hover (`before:bg-primary/20`)
  - Edge handles (e/w/n/s): `w-1.5` or `h-1.5` thin line, `hover:bg-primary/10`
  - Cursor indicators: `cursor-{se|sw|ne|nw|e|w|n|s}-resize`
  - SE corner gets a small border indicator (`after:border-r after:border-b`)
- All handles have `touch-action: none` and `z-20` to overlay card content
- **File:** `src/components/dashboard/ResizeHandle.tsx` (NEW — 65 lines)

### 4. DashboardGrid
- Replaced flex-based layout with absolute-positioned desktop layout
  - **Mobile:** `grid grid-cols-1 gap-4 md:hidden` (unchanged stacked layout)
  - **Desktop:** `hidden md:relative md:block` with absolute-positioned `DashboardCardWrapper` children
- Uses `useCardLayout` hook (not `usePanelResize` — removed)
- Tracks container size via `ResizeObserver` for percentage-to-pixel conversion
- `min-h-[600px]` on desktop container for adequate drag area
- Disables text selection during drag/resize (`userSelect: 'none'`)
- Converted to `forwardRef`, exposes `{ resetLayouts }` via `useImperativeHandle` (`DashboardGridHandle` type)
- **File:** `src/components/dashboard/DashboardGrid.tsx`

### 5. HomeClient
- Accepts `initialLayouts?: CardLayoutMap | null` from server
- `handleLayoutsChange` — debounced (500ms) save to `/api/settings` PATCH
  - Rounds values to 2 decimal places before saving
  - Only persists layouts for existing (visible) card IDs
  - Silent failure on network errors (UI state remains intact)
- **Reset Layout button** — calls `gridRef.current.resetLayouts()` and clears `dashboardCardLayouts` on the server via `/api/settings` PATCH
- **File:** `src/app/(app)/home/HomeClient.tsx`

### 6. Home Page (Server)
- Parses `dashboardCardLayouts` from `uiPreferences` JSON field
- Passes `initialLayouts={dashboardCardLayouts}` to `HomeClient`
- Otherwise unchanged
- **File:** `src/app/(app)/home/page.tsx` (MODIFIED — 344 lines)

### 7. Dashboard Cards Config
- Added `DashboardCardLayout` interface:
  ```ts
  export interface DashboardCardLayout {
    x: number          // Percentage-based left position (0-100)
    y: number          // Percentage-based top position (0-100, or pixel for auto=300)
    width: number      // Percentage-based width (25-100)
    height: number | 'auto'  // Height in pixels, or 'auto' (auto-height = 300px rendered)
  }
  ```
- Added optional `layout?: DashboardCardLayout` to `DashboardCardConfig`
- `mergeDashboardCards()` preserves `card.layout` when merging saved cards
- **File:** `src/lib/dashboard-cards.ts` (MODIFIED — 79 lines)

### 8. Cleanup
- **Removed:** `src/lib/hooks/usePanelResize.ts` — replaced by `useCardLayout`
- **Removed:** `src/components/dashboard/PanelResizeHandle.tsx` — replaced by `ResizeHandle`

## Design
- **Persistence:** User's layout positions are stored in `User.uiPreferences` as a JSON object (`dashboardCardLayouts` key), saved via debounced `PATCH /api/settings` 500ms after last interaction
- **Collision resolution:** Cascading push-down algorithm; cards displaced by a moved/resized card are pushed below the moved card's bottom edge plus 16px gap. Cascading continues for pushed cards that now overlap others. Max 50 iterations to prevent infinite loops.
- **y coordinate system:** `y` is always stored in **pixels** for all cards (regardless of `height: 'auto'`). `x` and `width` remain percentage-based. This eliminates the circular dependency on container height that caused overlapping cards and cards disappearing during drag.
- **Stale layout detection:** Saved auto-height cards with `0 < y < 150` are treated as old percentage-format values and discarded, triggering fresh auto-positioning on next load.
- **Auto-positioning:** New cards (not yet persisted) are placed full-width, stacked vertically at 416px intervals
- **No migrations required** — all layout data stored in the existing `uiPreferences` JSON field
- **Mobile unchanged** — still uses simple stacked grid layout

## Files Created (3)
- `src/lib/hooks/useCardLayout.ts`
- `src/components/dashboard/DashboardCardWrapper.tsx`
- `src/components/dashboard/ResizeHandle.tsx`

## Files Modified (4)
- `src/components/dashboard/DashboardGrid.tsx`
- `src/app/(app)/home/HomeClient.tsx`
- `src/app/(app)/home/page.tsx`
- `src/lib/dashboard-cards.ts`

## Files Removed (2)
- `src/lib/hooks/usePanelResize.ts`
- `src/components/dashboard/PanelResizeHandle.tsx`

## Verification
- ✅ `npx tsc --noEmit` passes (zero new TypeScript errors; pre-existing test type error is unrelated)
- ✅ `npx next build` passes (exit code 0, all 89 pages generated, all routes `ƒ (Dynamic)`)
- ✅ Production build compiles with zero errors
- ✅ Docker configuration unchanged — no migrations needed
