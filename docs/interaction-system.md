# Interaction & motion system

How HomeBase gets its "native app" feel. Four primitives, all defined in
[`src/app/premium.css`](../src/app/premium.css) (the polish layer, loaded **last** in
[`layout.tsx`](../src/app/layout.tsx) so it wins source-order ties) plus two small client
helpers. Everything degrades cleanly: no JS, no API, and a full bypass under
`prefers-reduced-motion`.

Design tokens used throughout (defined in premium.css):

- `--hb-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` — overshoot ease for things that "pop".
- `--hb-ease-out` — settle ease for fades/rises.

> **Composable transforms.** Hover-lift, press-scale, and scroll-reveal each animate an
> *independent* CSS property (`translate` / `scale`), never the combined `transform`
> shorthand. That way they stack instead of clobbering each other.

---

## 1. Scroll-reveal

Content fades + rises into view as it enters the viewport, with an optional stagger so a
batch of cards cascades.

**Pieces**

- [`src/hooks/useReveal.ts`](../src/hooks/useReveal.ts) — returns a `ref`. One **shared,
  module-level** `IntersectionObserver` serves every revealable element on the page (one
  observer, not one per element). On first intersection it adds `.is-visible` and
  **unobserves** the element so it never re-hides. SSR-safe (no `window` access during
  render); if `IntersectionObserver` is missing it falls back to instant-visible.
- [`src/components/ui/Reveal.tsx`](../src/components/ui/Reveal.tsx) — the reusable wrapper.
  A plain block `div` that inherits its parent's grid/flex slot, so dropping it around a
  card doesn't disturb layout.
- `.reveal` / `.reveal.is-visible` in premium.css — the start (`opacity:0; translate:0 16px`)
  and end states, transitioned with `--hb-ease-out` (opacity) + `--hb-spring` (translate),
  delayed by `--reveal-delay`.

**Usage**

```tsx
import { Reveal } from '@/components/ui/Reveal'

{items.map((item, i) => (
  <Reveal key={item.id} index={i}>
    <Card … />
  </Reveal>
))}
```

`index` staggers the reveal (`Math.min(index, 6) * 55ms`, capped so long lists don't
delay forever). Omit it for a single element. Reference implementation:
[`documents/page.tsx`](../src/app/(app)/documents/page.tsx).

---

## 2. Skeleton shimmer

Loading placeholders sweep a moving sheen instead of the old `animate-pulse` opacity blink.

**Pieces**

- `.skeleton` + `@keyframes hb-skeleton-sweep` in premium.css. A `linear-gradient` sheen is
  animated across the element via `background-position` (200% travel).
- Theme adaptation is automatic: the sheen colours are `color-mix(in oklab,
  var(--foreground) …, transparent)`, so every class-based theme (light, dark, and the
  Apple themes) gets a correctly-tinted shimmer with **no per-theme overrides**.

**Usage** — give any placeholder box the `skeleton` class (drop `animate-pulse`):

```tsx
{Array.from({ length: 8 }).map((_, i) => (
  <div key={i} className="h-32 rounded-lg skeleton" />
))}
```

---

## 3. Spring modals & sheets

Dialogs and right-side sheets open with an overshoot spring rather than a linear ease.

**How** — HomeBase dialogs/sheets are built on the base-ui Popup primitive, which exposes
`data-open` / `data-closed` state attributes (note: **not** radix `data-state`). premium.css
overrides the open-state animation timing for both:

```css
[data-slot="dialog-content"][data-open],
[data-slot="sheet-content"][data-open] {
  animation-timing-function: var(--hb-spring) !important;
  animation-duration: 300ms !important;
}
```

The base components keep providing the keyframes (`tailwindcss-animate`'s
`zoom-in-95` / `slide-in-from-bottom`); we only retime them. Nothing to do at the call
site — every Drawer/Dialog inherits the spring automatically.

---

## 4. View Transitions (route morphs)

Cross-fade between routes using the native View Transitions API.

**Why a JS interceptor and not the CSS `@view-transition` rule:** the App Router does
client-side ("soft") navigation, so the CSS multi-page-app rule never fires. Instead
[`src/components/providers/ViewTransitions.tsx`](../src/components/providers/ViewTransitions.tsx)
mounts once in the root layout and intercepts same-origin internal link clicks, wrapping
`router.push` in `document.startViewTransition`. A double `requestAnimationFrame` resolves
the transition only after React has committed the new route, so it snapshots fresh content.

**Heavily guarded — it never blocks navigation:**

- No-ops entirely if the API is unavailable **or** `prefers-reduced-motion` is set.
- Only plain left-clicks on internal anchors are intercepted. New-tab / modified
  (`ctrl`/`meta`/`shift`/`alt`) / `target=_blank` / `download` / external / hash / `mailto:`
  / `tel:` / same-URL clicks all fall through untouched.
- Opt a single link out with `data-no-vt`.

The cross-fade itself (`::view-transition-old(root)` / `::view-transition-new(root)`,
keyframes `hb-vt-fade-out` / `hb-vt-fade-rise`) is styled in premium.css. Zero new
dependencies.

---

## Reduced motion

premium.css ends with a `@media (prefers-reduced-motion: reduce)` block that collapses these
animations. The View Transitions interceptor additionally bails before binding its click
handler when reduced-motion is on, so navigation stays an instant cut.

## Adding motion to a new page

1. **List loading?** give placeholders `className="skeleton"`.
2. **Cards/rows that scroll in?** wrap each in `<Reveal index={i}>`.
3. **Modal/sheet?** nothing to do — the spring is inherited from the base components.
4. **Route links?** nothing to do — the global interceptor handles same-origin navigation.
