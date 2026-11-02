# Pre-Code Checklist — tick the sections that apply

Auto-loaded with AGENTS.md (which has the reasoning). This file is the quick list.

## Every change
- [ ] `npx tsc --noEmit` clean **before** (baseline) and **after**
- [ ] Touched a shared lib function? Grep every caller; fix the pattern everywhere, not just the reported file
- [ ] Domain logic is in a `src/lib/` helper, not inline in a route/page; no second copy of anything
- [ ] Every changed line traces to the request

## Dates (#1 bug source)
- [ ] Boundaries via `todayBoundsInTz` / `nDaysFromTodayInTz` / `monthBoundsInTz` — never UTC midnight
- [ ] Display via `formatInTz`; events bucketed via `eventFallsOnDay`
- [ ] No `date-fns`, no direct Luxon/`Date` math outside `src/lib/timezone.ts` (meal plan `zone: 'utc'` is the exception)

## Forms and drawers (#2 bug source)
- [ ] Listed every input/select/textarea/checkbox before editing; all present after
- [ ] `openEdit`/`openNew` assign every field; PATCH/PUT sends every editable field; API accepts them
- [ ] Every `DrawerContent` has `showCloseButton={true}`

## Finance — pick the tier (AGENTS.md "Finance change tiers")
- [ ] Tier 1–3 (UI, future postings, shared GL core): fix, verify, report — no permission needed
- [ ] Tier 4–5 (changes posted data/closed periods, destructive or bulk scripts): **confirm with the user first**, dry-run first
- [ ] Ran the QA.md §5 smoke test for the touched flow; DR=CR on anything created
- [ ] Tier 3: QA.md §1.1 + §2 before, full lifecycle after
- [ ] Checked the bills↔income mirror
- [ ] Parent thread only, own commit, lifecycle stage named in the message

## API routes
- [ ] `auth()` → 401; admin → 403; no `requireSession()`/`requireAdmin()` in handlers
- [ ] Handlers wrapped with `withRouteErrors`
- [ ] Queries scoped by `familyId` (`findFirst({ where: { id, familyId } })`)
- [ ] Unguarded-route sweep run (AGENTS.md security rule 7); no new public route without sign-off

## SSR
- [ ] No `window`/`document`/`localStorage`/`sessionStorage` in `useState` initialisers or at module load

## Before reporting done
- [ ] Walked it from the user's chair: every site, default/empty states, full lifecycle, gestures, mobile/offline
- [ ] Summary states the walk-through and any known gap, with a recommendation
