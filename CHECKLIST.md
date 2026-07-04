# Pre-Code Checklist — Read Before Every Change

This file is auto-loaded every session. Work through the relevant sections before writing code.

---

## Every change

- [ ] `npx tsc --noEmit` passes **before** the change (baseline) and **after** (no regressions)
- [ ] Touched a shared lib function? Grep all callers — fix the same pattern everywhere, not just the reported file
- [ ] Every changed line traces directly to the user's request — no bonus cleanup, no speculative abstractions

---

## Shared helpers — no inline domain logic (recurring #1 architectural defect)

Domain logic keeps getting hand-copied inline across routes; the copies drift and the same bug resurfaces in a new file. **See AGENTS.md §Shared helpers over inline logic.**

- [ ] Any domain/business logic (compute, schedule, post, rotate, decide status) lives in a `src/lib/` helper — **never inline in a route or page**
- [ ] Before writing logic in a route, grep `src/` for it — if it exists, call the helper; if not, create one **first**, then call it
- [ ] Same logic about to exist in a 2nd place? Extract to a shared helper now — don't wait for the 3rd copy
- [ ] Pages/components call APIs; they never compute domain values themselves
- [ ] DB-writing helpers are server-only; client-imported helpers stay free of `prisma`/server imports (split if needed — e.g. `chore-helpers.ts` + `chore-completion.ts`)

---

## Date and time — #1 source of bugs in this codebase

The server is UTC. The user is UTC+10/+11. They are not the same. **All app date logic uses Luxon (via `src/lib/timezone.ts` helpers), not `date-fns` or raw `Date` math. See AGENTS.md §Timezone and QA.md §12.20.**

- [ ] **Never** use `new Date('YYYY-MM-DDT00:00:00Z')` as a day boundary → use `todayBoundsInTz(timezone)`
- [ ] **Never** use `date-fns` or raw `Date` math for boundaries/formatting → use helpers from `src/lib/timezone.ts` (Luxon-backed)
- [ ] **Never** call Luxon `DateTime` directly in a route/component → only inside the `src/lib/timezone.ts` helpers; app code calls the helpers
- [ ] **Never** bucket calendar events by parsing `event.end` in local time → use `eventFallsOnDay(event, day, timezone)`
- [ ] Display dates with `formatInTz(date, timezone, options)` — not `format()` from date-fns or `toLocaleDateString()` without an explicit zone
- [ ] Meal plan dates are UTC midnight by convention — display with Luxon `zone: 'utc'` (this is the one exception)

---

## Forms and dialogs — second most common bug source

Silent field loss during layout refactors has happened repeatedly. **See AGENTS.md §Form rules.**

- [ ] List every `<input>`, `<select>`, `<textarea>`, and checkbox **before** editing
- [ ] Verify every field is still present **after** editing
- [ ] `openEdit` / `openNew` explicitly assigns every interface field — no silent fallback to empty defaults
- [ ] PATCH/PUT body sends every editable field
- [ ] API handler accepts every field the form sends

---

## Drawers

- [ ] Every `DrawerContent` has `showCloseButton={true}`
- [ ] After any drawer layout change, run: `grep -rn "DrawerContent" src/ --include="*.tsx" | grep -v "showCloseButton\|import\|sheet.tsx"`

---

## Finance — always consult QA.md first

- [ ] **Standard = Xero/MYOB + a chartered accountant signs off** (AGENTS.md North-star). Ask "what would a commercial accounting product do here?" — that answer is the spec
- [ ] Accounting incorrectness is **fixed now, not deferred** — it's a stop-ship defect, not an out-of-scope find (AGENTS.md North-star §2)
- [ ] Read **QA.md §1** (blast-radius protocol) before touching any finance file
- [ ] Read **QA.md §2** (accounting invariants) before any GL or journal change
- [ ] Read **QA.md §12** (known anti-patterns) — especially 12.1, 12.2, 12.7, 12.9, 12.20
- [ ] GL posting logic in `src/lib/` helpers only — never inline in a route
- [ ] Bug found in bills? Check income for the same bug. Bug found in income? Check bills. (AGENTS.md Finance rule 5)

---

## API route security — see AGENTS.md §API route security

There is no middleware.ts — a route without its own auth check is publicly reachable.

- [ ] Every new/touched route starts with `auth()` → 401 if no session; admin routes also check `user.role !== 'admin'` → 403
- [ ] Every exported handler is wrapped: define `async function _GET(...)` and `export const GET = withRouteErrors(_GET)` (from `src/lib/route-errors.ts`) — an unhandled throw must return a JSON 500, never an empty body
- [ ] Every query scoped to `user.familyId` — `findFirst({ where: { id, familyId } })`, never bare `findUnique({ where: { id } })`
- [ ] No new unauthenticated route without explicit user sign-off; unauthenticated responses leak no paths/versions/raw errors
- [ ] After touching routes, sweep: `rg --files-without-match "auth\(\)|requireSystemAdmin|ADMIN_RESET_TOKEN|IMAGE_CACHE_TOKEN" -g "route.ts" src/app/api` — every hit must be on the known-public list (AGENTS.md rule 4)

---

## SSR safety

- [ ] No `sessionStorage`, `localStorage`, `window`, or `document` in `useState` initialisers — wrap in `typeof window !== 'undefined'` or move to `useEffect`
- [ ] No `requireSession()` or `requireAdmin()` in API route handlers — use `auth()` directly and return `NextResponse.json({ error }, { status })` (QA.md §12.12)
