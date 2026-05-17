# Homebase — Trips redesign (drop-in deliverables)

A prototype + extractable CSS/components for the Trips area redesign. Live demo: `index.html`.

## What's in here

| File | Purpose |
|------|---------|
| `homebase-trips.css` | **Drop-in stylesheet.** Uses your existing CSS variables (`--primary`, `--card`, `--background`, etc) so it inherits whichever Homebase theme is active. Defines all the new component classes (cards, segmented tabs, day rail, timeline, drawer, chips, category tiles, **drag-reorder indicators**, **map pane**, **cover-photo slot**). |
| `index.html` | Demo host. Replicates your `apple-aqua`-style tokens so you can preview the redesign standalone. Loads Leaflet + image-slot. |
| `data.js` | Mock trip / day / activity data — replace with your real `TripSummary` / `TripDetail` shapes. Activities now carry optional `lat` / `lng` for the map. |
| `icons.jsx` | Inline-SVG icon set (~25 Lucide-style glyphs). Swap for your existing `lucide-react` imports in the real app. |
| `shared.jsx` | Reusable building blocks: `HBChip`, `HBTagChip`, `HBTagPicker`, `HBCategoryGrid`, `HBStatusPill`, `HBField`, date helpers. |
| `drag-reorder.jsx` | `useSortable(items, setItems, opts)` hook — HTML5 native drag-and-drop with drop indicators. No dependencies. |
| `image-slot.js` | `<image-slot>` web component. Drag-drop target for user-supplied images; persists across reloads. |
| `view-trips.jsx` | Replacement for `TripsClient.tsx`. Hero cards with **drop-in cover photo** (gradient as fallback), status, countdown, packing badge, tags. |
| `view-trip-detail.jsx` | Replacement for `TripDetailClient.tsx` + `ItinerarySection.tsx` + `ActivityEditDialog.tsx`. Segmented tabs, **drag-reorderable day rail**, **drag-reorderable activities**, **map split-pane**, right-side activity drawer. |
| `app.jsx` | Demo shell with Tweaks panel exposing tab style / card style / density / theme. |

## Why this is better than the current trips UI

1. **Trips index** — each trip now has a cover and visual identity, status + countdown + packing always visible on one line, tags shown directly. No more flat horizontal list with hidden context.
2. **Trip detail tabs** — segmented chip control replaces text-with-tiny-icon underline tabs. Bigger hit targets, clearer selection state.
3. **Itinerary** — split into a vertical **day rail** + **timeline**. You see all days at once on the left, click one to focus its activities on the right. No more deeply nested expand/collapse.
4. **Activity edit drawer** — slides in from the right (480px) instead of taking over the screen as a modal. The category picker is a **5-tile visual grid** (Eat / Stay / Move / See / Do) instead of a `<select>`. Tags are a chip grid instead of a buried popover.
5. **Quick-actions** — pencil/delete appear on activity-card hover, no more invisible 12px buttons.
6. **Hover affordances** — trip cards lift on hover, activity cards highlight, drawer has a backdrop blur. Everything telegraphs interactivity.

## Class API (drop-in primitives)

These class names are what you'd paste into your existing JSX/Tailwind to swap visuals without changing data flow:

```html
<!-- Trip card -->
<article class="hb-trip-card">
  <div class="hb-trip-card__cover hb-cover--ocean">…</div>
  <div class="hb-trip-card__body">…</div>
</article>

<!-- Segmented tabs (replaces underline tabs) -->
<div class="hb-segmented" role="tablist">
  <button class="hb-segmented__item" aria-selected="true">Itinerary</button>
  …
</div>

<!-- Status pill -->
<span class="hb-status hb-status--upcoming">Upcoming</span>
<span class="hb-status hb-status--live">In progress</span>

<!-- Tag chip -->
<span class="hb-chip hb-chip--filled" style="background:#f97316">🍜 Foodie</span>

<!-- Category visual picker -->
<div class="hb-cat-grid">
  <button class="hb-cat-tile hb-cat-meal" aria-pressed="true">…</button>
</div>

<!-- Activity row -->
<div class="hb-activity">
  <div class="hb-activity__time">…</div>
  <div class="hb-activity__main">…</div>
  <div class="hb-activity__quick">…</div>
</div>

<!-- Drawer (replaces ActivityEditDialog modal) -->
<div class="hb-drawer-backdrop" />
<aside class="hb-drawer">…</aside>
```

## Cover palettes (`hb-cover--*`)

`sunset` (cherry blossom), `ocean` (byron bay), `forest`, `desert` (lisbon), `alpine` (ring road), `neutral`.
Pick by season / region / vibes. You can store the chosen variant on the trip itself.

## Tweaks (live in the demo)

- **Detail tab style** — Segmented / Pill row / Underline
- **Trip card style** — Hero cover / Minimal
- **Density** — Comfortable / Compact
- **App theme** — Default / Ocean (Byron Bay blues) / Alpine (Ring Road slate) / Blossom (Cherry Blossom sunset)

## Wiring it into the real app

1. Drop `homebase-trips.css` into `src/app/` and import it after `globals.css`.
2. Replace `TripsClient.tsx` body with the JSX from `view-trips.jsx` — keep your existing data hooks (`fetch('/api/trips')`, mutation calls, etc).
3. Replace `ItinerarySection.tsx` content with `view-trip-detail.jsx`. The data shape matches your `TripDayShape` / `TripActivityShape` types.
4. Replace `ActivityEditDialog` invocation with the drawer pattern. Rich-text editor (`NoteEditorToolbar`) plugs into the `Notes` field as before.
5. The category list (`CATEGORIES` in `data.js`) maps to your existing `CATEGORIES` constant in `ActivityEditDialog.tsx` — keep the same `value` strings and you get the visual upgrade for free.

## Notes on accessibility / behavior preserved

- All buttons keep `aria-label`/`title`.
- Tab control uses `role="tablist"` + `aria-selected`.
- Drawer uses `role="dialog"`.
- Focus rings inherit your `--ring` token.
- Day rail and activity quick-actions are keyboard-reachable.
- Tag picker dismisses on outside-click (same pattern as your existing code).

## New features (added in this round)

### 1. Drag-reorder days + activities

Hook in `drag-reorder.jsx`:

```jsx
import { useSortable } from './drag-reorder.jsx'

const sortable = useSortable(items, setItems, {
  id: 'activities-day1',  // namespace so two sortables don't accept each other
  handleOnly: true,       // only the drag-handle initiates drag (not the whole row)
})

return items.map((it, i) =>
  <div {...sortable.itemProps(i)} key={it.id}>
    <span {...sortable.handleProps(i)}>⠿</span>
    {it.title}
  </div>
)
```

- Drop indicators are a 2px line above/below the target — driven by `.hb-sortable--drop-before` / `--drop-after` classes that the hook toggles for you.
- Drag handle on activities slides in from the left on hover (`.hb-activity__handle`).
- Day chips have a fixed handle on the left (visible on hover).
- For your backend: when `setItems(newOrder)` fires, POST the reordered ids to `/api/trips/[id]/days/[id]/activities/reorder` (or similar) so the server persists the new order.

### 2. Map pane (Leaflet)

Toggle from the day-head row. Activities with `lat` + `lng` show as numbered, category-coloured pins. The pins are connected with a dashed line in stop order. Clicking a pin opens the activity drawer.

- Free tiles from Carto (`light_all`) — no API key. Swap to Mapbox / Google by changing the `tileLayer` URL in `view-trip-detail.jsx` → `TripMap`.
- Geocoding isn't included — you'll want a server-side resolve when the user types into the Location field in the drawer, then store `lat`/`lng` on the activity row.

### 3. Cover photos per trip

Each trip card now renders an `<image-slot id="trip-cover-{tripId}">` inside `.hb-trip-card__cover`. While empty, the procedural gradient (`hb-cover--ocean` etc) shows through. Drop an image and it covers the gradient.

- Persistence: `image-slot.js` writes to a sidecar JSON for the demo. In your real app, hook the slot's drop event to POST the file to `/api/trips/[id]/cover` and store the URL on the trip; then render `<image-slot src="{trip.coverUrl}">` to use that as the displayed image.
- The same pattern works for a giant hero image at the top of the trip-detail page — just place an `<image-slot id="trip-{tripId}-hero" style="height:240px">` above `.hb-trip-hero`.
