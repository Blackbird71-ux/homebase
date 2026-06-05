# General coding discipline

## 1. Surface assumptions before coding
State assumptions explicitly before implementing. If multiple interpretations exist, present them — don't pick silently. If something is unclear, stop and ask rather than guessing.

## 2. Simplicity first
Minimum code that solves the problem. No features beyond what was asked, no abstractions for single-use code, no speculative flexibility. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?"

## 3. Surgical changes
Touch only what you must. Don't improve adjacent code, comments, or formatting that isn't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Every changed line should trace directly to the user's request.

## 4. Plan before multi-step tasks
For any task with more than one distinct step, state a brief plan with verifiable outcomes before starting:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

## 5. Report, don't fix — out-of-scope discoveries
When you uncover a bug, smell, or improvement that is **outside the scope of the current task**, the default is to **report it, not fix it.** Do not silently expand the diff. This protects the original task (it keeps the agent's attention and context budget on what was asked) and keeps every change attributable (if the task's diff regresses something, it should contain one intent, not opportunistic side-fixes).

**On discovery, do this instead of fixing:**
1. **Stop and surface it.** Don't keep working past it silently.
2. **Document it thoroughly, right now, while the context is loaded.** This is the most important step. A deferred find is only safe if a future reader (you, another agent, or the user) can act on it cold, without re-deriving everything. The cheap thing to lose later is *what to change*; the expensive thing is *why the code is shaped this way and what breaks if you touch it* — capture that now, because it will be gone in three weeks. A one-line "fix X later" is a trap, not a deferral.
3. **Propose where to log it** (follow-up task, a QA.md §12 bug-pattern entry, or an audit-prompt sweep) and let the user triage.
4. **Wait for confirmation before fixing.** Don't fix unless the user says so.

**A deferred-issue report must contain — do not abbreviate:**
- **Location** — file(s), function/component, and line references. List *every* site if more than one (see instance-vs-class below).
- **Symptom** — what's wrong and how it manifests (or would manifest) to the user / to the GL / to data integrity.
- **Why the code is currently like this** — the constraint, history, or assumption that explains the present shape. This is the context that evaporates; write it down even if it feels obvious today.
- **Failure modes of the naïve fix** — what a careless change would break, what semantics must be preserved, what to test afterward. Name the specific invariant or smoke test (e.g. "must keep DR=CR", "re-run J1–J7", "preserve retry-on-conflict").
- **Blast radius** — what else imports/depends on the affected code (cross-reference QA.md §9 for finance, §1.1 otherwise).
- **Suggested fix direction** — enough of a sketch that the work can start without rediscovery, explicitly marked as a proposal, not a decision.
- **Severity / urgency** — so the user can triage queue position (live data damage vs. cosmetic).

Write the report as if the reader has none of your current context, because they won't. If it's worth a code change later, it's worth a paragraph now.

**Instance vs. class — the most important call at discovery.** Ask: *could this same issue exist elsewhere?* If yes, fixing only the instance in front of you is **actively harmful** — it creates a fixed-here / silently-broken-there divergence, which is worse than a consistently-wrong codebase you can sweep in one pass (this is the §12.7 "fix one instance, miss others" pattern in QA.md). A class-level discovery must become a dedicated sweep task (and the report must enumerate every known site), never an inline fix.

**The only exceptions — address now, but still isolate and document:**
- Completing the current task **genuinely requires** the fix (the task cannot land correctly without it), or
- The issue is **live damage to real data** (especially finance/GL — see QA.md).

In both cases, make the fix, but give it its **own logical change / commit**, note the coupling to the original task in the commit message, and still write the find up (in the commit body or QA.md §12 if it's a new pattern). "Required to proceed" is not a licence to blur two changes into one unattributable diff, nor to skip documentation.

This generalizes §3: "if you notice unrelated dead code, mention it — don't delete it" is the same instinct applied to every kind of discovery.

---

# Timezone rules — ALL date logic must work in the user's local time, via Luxon

The server runs in UTC. The database stores all datetimes in UTC. The user lives in a local timezone (e.g. Australia/Sydney = UTC+10/+11 with DST). These are not the same and the difference causes bugs.

**The rule: every date boundary, filter, and display must be computed relative to the user's local timezone, not UTC — using [Luxon](https://moment.github.io/luxon/) (`DateTime` with an explicit zone).** Do **not** hand-roll UTC-offset arithmetic, do **not** use `date-fns`, and do **not** use raw `Date` math for boundaries or formatting.

> **OS clock vs. app date logic — two different concerns.** The container/OS timezone (`TZ=Australia/Sydney` + `tzdata`, used by the backup cron and log timestamps) is configured at the infra layer — see `.roo/prompts/build-deploy-guide.md`. *Application* date logic (boundaries, filters, display) is Luxon's job. This section is about the latter; do not conflate them.

## The correct pattern

Use helpers from `src/lib/timezone.ts` — these are the **only** approved way to compute date boundaries and format dates server-side, and they are implemented on Luxon's `DateTime`. App code calls the helpers; it never calls Luxon or `Date` directly:

```ts
// Today's start/end as UTC Dates representing local midnight (Luxon: startOf/endOf 'day' in zone):
const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
// todayStart for UTC+10 on 2026-05-23 = 2026-05-22T14:00:00Z  ← NOT 2026-05-23T00:00:00Z

// Rolling N-day window end (= local startOf('day').plus({ days: N })):
const endDate = nDaysFromTodayInTz(7, timezone)

// Current calendar month start/end:
const { start: monthStart, end: monthEnd } = monthBoundsInTz(timezone)

// Timezone-aware display (replaces toLocaleDateString / date-fns format):
const label = formatInTz(date, timezone, { weekday: 'short', day: 'numeric', month: 'short' })

// Calendar day bucketing for events:
const onDay = eventFallsOnDay(event, day, timezone)  // from src/lib/event-helpers.ts
```

The helpers wrap Luxon (e.g. `DateTime.now().setZone(tz).startOf('day').toJSDate()`). Use `todayStart` directly as range boundaries in Prisma queries and in-code filters. Never substitute UTC midnight (`new Date('YYYY-MM-DDT00:00:00Z')`) as a stand-in for "start of day".

**Meal plan exception:** Meal plan dates are stored as UTC midnight of the calendar date by convention. Displaying them with `zone: 'utc'` (Luxon) is intentional and correct — do not replace these with zone-aware `formatInTz`.

## The failure modes

**Missing events:** Computing a day boundary as UTC midnight is **wrong** for users east of UTC. For UTC+10, real local midnight = `2026-05-22T14:00:00Z`, but UTC midnight = `2026-05-23T00:00:00Z` — 10 hours late. Events between 14:00Z and 00:00Z are excluded.

**Duplicate events (spillover):** Synthetic all-day events use `end = T23:59:59.000Z`. For UTC+10 this is 09:59 next-day local time. Bucketing by parsing that end timestamp in local time makes the event appear on two consecutive calendar days. Fix: use `eventFallsOnDay(event, day, timezone)`, which compares day-keys in the user's zone.

## Rules

1. **Never use `normalizeToUtcMidnight(dateStr)` as a query boundary for "today".** It returns UTC midnight, not the user's local midnight.
2. **Never construct a day boundary with `new Date('YYYY-MM-DDT00:00:00Z')`.** Same problem.
3. **Never use `startOf(new Date(event.end))` to bucket calendar events.** Use `eventFallsOnDay(event, day, timezone)` from `src/lib/event-helpers.ts`.
4. **`todayStart` from `todayBoundsInTz` is the single source of truth** for the start of today in all queries and in-code filters.
5. **Scope/window end boundaries must also be tz-aware.** Use `nDaysFromTodayInTz(N, timezone)` — never compute as UTC midnight of the Nth future date.
6. **In-code filters must use the same boundaries as the DB query.**
7. **Display: use `formatInTz(date, timezone, options)` from `src/lib/timezone.ts`.** Do not use `date-fns` `format()` or `Date.toLocaleDateString()` without an explicit zone — both use the JS runtime timezone (UTC on the server).
8. **Never `import ... from 'date-fns'` in any file.** date-fns is being retired in favour of Luxon. Use the `src/lib/timezone.ts` helpers (which wrap Luxon); only reach for raw Luxon inside those helpers, never in routes/components.
9. **Test across DST boundaries** (Australia: the Oct and Apr transitions) for any new date logic.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Form / Dialog / Editor safety rules — READ BEFORE TOUCHING ANY FORM

These rules exist because layout refactors repeatedly caused silent field loss (fields removed from the UI without data loss, but the user loses the ability to set/edit them). This is a recurring bug pattern and must be prevented proactively.

## Before editing any form, dialog, or editor component

1. **Enumerate all inputs first.** Before making any change, read the component and list every `<input>`, `<select>`, `<textarea>`, and checkbox in it — including those hidden behind conditionals (`form.billType === 'recurring'`, etc.).

2. **Verify all are still present after editing.** Cross-check the post-edit component against the list from step 1. Every field must still appear in the JSX somewhere.

3. **Never remove a field without explicit user instruction.** If a field needs to move (e.g., to a different column or tab), move it — don't drop it. Removing a form field is a user-visible breaking change. If you think a field should be removed, stop and ask first.

4. **"Preview-only" is not an excuse.** Do not replace editable fields with read-only display, and do not add notices like "this field is preview-only" unless the user has specifically asked for that behaviour. If a field appears in the DB schema, the user should be able to edit it.

## When creating a new form that mirrors an existing model

1. **Cross-check the Prisma schema.** Open `prisma/schema.prisma` and read the model definition. Every scalar field that makes sense in the UI must appear in both the TypeScript interface AND the JSX form.

2. **Match the TypeScript interface to the model.** If the API returns a field (confirmed by reading the route), the interface must declare it. A narrower interface than the DB model is a latent bug.

3. **Populate all fields in `openEdit`-style functions.** When seeding a form from fetched data, every interface field must be explicitly assigned — not just the ones that seem obvious. Silently falling back to `emptyForm` defaults for fields that exist in the data is a bug.

4. **Send all editable fields in PATCH/PUT bodies.** If a field appears in the form, it must be sent to the API. If the API doesn't accept it yet, update the API handler at the same time.

## When refactoring layout (columns, tabs, accordions, scroll regions)

- Layout changes are the highest-risk operation for field loss. Treat them like a surgical procedure: read, list fields, edit, verify.
- Moving sections into tabs or collapsible panels is only safe if *every section is reachable* — not just theoretically scrollable. If a section can be pushed below the fold by taller siblings, split it into its own independently-scrollable pane.
- Do not consolidate two separately-scrollable sections into one shared scroll region without explicitly verifying that the content fits within the dialog height.

## Quick checklist before submitting any form-related change

- [ ] Listed all fields before editing
- [ ] All fields present after editing
- [ ] No field removed without user instruction
- [ ] TypeScript interface matches DB fields returned by the GET API
- [ ] `openEdit`/`openNew` populates every interface field
- [ ] PATCH/PUT body includes every editable field
- [ ] API handler accepts every field sent by the form

---

# Shared helpers over inline logic — APP-WIDE rule (not just finance)

**Every piece of domain/business logic lives in a shared `src/lib/` helper and is called from there. Routes and pages stay thin: they authenticate, parse input, call helpers, and shape the response. They contain no reusable logic of their own.**

This is the single most-repeated source of recurring bugs in this codebase. The same operation gets hand-written inline in two, three, four places — completion + rotation across the chore routes, GL posting across the bill/income routes, date math across the chore routes. The copies drift, a fix lands in one and not the others, and the same bug is "found again" months later in a different file. Writing logic inline is how the bug is created; extracting it to one helper is how it is prevented. **Do not inline domain logic, even once.**

## Rules

1. **No domain logic inline in a route handler or page.** If a route does anything beyond auth + parse + call + respond — computes a value, advances a schedule, posts a journal, rotates an assignee, decides a status — that work belongs in a `src/lib/` function the route calls.

2. **Before writing logic in a route, look for an existing helper.** If one exists, call it. If one doesn't, create it in `src/lib/` first, then call it. Never inline "just this once."

3. **Two copies is one too many.** The moment the same logic would exist in a second place, stop and extract it to a shared helper, then point both callers at it. Don't wait for the third copy to appear.

4. **Pages call APIs; pages do not compute.** A `.tsx` page/component never makes domain decisions (balances, due dates, rotation, posting). It renders data and calls endpoints.

5. **Shared helpers are the single source of truth.** If a helper exists for an operation, every caller uses it. Re-implementing it inline — even slightly differently — is a bug.

6. **Mind the client/server split when extracting.** Helpers with DB writes or server-only imports (`prisma`, `auth`) must live in server-only files. Pure helpers imported by client components (e.g. `chore-helpers.ts`) must stay free of `prisma`/server imports. When a concern needs both, split it: pure math in the client-safe file, DB writes in a server-only file (see `chore-helpers.ts` + `chore-completion.ts`).

7. **The only exception is "genuinely not possible":** one-off glue with no second caller and no reusable logic (e.g. a route that only forwards parsed params). If you believe something can't be a helper, state why in one line — don't silently inline it.

## Verify before finishing
When you touch or add a route, grep `src/` for the operation you just wrote. If it appears in more than one file, it must become a shared helper before you finish. The Finance (below) and Timezone (above) sections are specific instances of this same rule.

---

# Finance module architecture — shared functions over inline logic

**Keep accounting logic in `src/lib/` helpers, not duplicated in routes or pages.** (This is a specific instance of the app-wide rule above.)

This rule exists because inline copies of accounting logic (journal creation, reversal, balance calculation) cause the same bug to exist in multiple places — fixing it in one route leaves the others broken, and inconsistent behavior erodes accounting integrity.

## Rules

1. **Never write GL posting logic inline in an API route.** If a route needs to create a journal entry, call a shared function in `src/lib/` (e.g., `postBillAccrualJournal`, `upsertBillDraftJournal`). If the shared function doesn't exist yet, create it before writing the route logic.

2. **Pages call APIs; pages do not calculate GL amounts.** A `.tsx` page component must never compute account balances, post journal entries, or make accounting decisions. All such logic belongs in API routes and `src/lib/` helpers.

3. **One fix, one place.** If you find yourself updating the same accounting logic in more than one file, stop — extract it to a shared function first, then update the callers.

4. **Shared helpers are the source of truth.** If `src/lib/` has a function for an operation (e.g., `ensureAccountsPayableCategory`), every route that needs that operation must call that function. Never re-implement it inline.

5. **Bills and income are parallel modules — any bug in one almost certainly exists in the other.** `src/app/api/finance/bills/route.ts` and `src/app/api/finance/income/route.ts` implement the same lifecycle patterns (draft spawn, receipt/payment recording, GL posting, cancellation, void) with nearly identical code. Whenever you fix or add logic in one, immediately check the other. This applies to: GET status filters, PATCH spawn blocks, template cursor advancement, approval logic, and void handling.

---

# Drawer pattern standards

All form editors, detail panels, and complex dialogs must use the right-side Drawer from `@/components/ui/sheet`. Centred `Dialog` is only appropriate for small confirm/alert prompts (≤2 fields: void, delete, PIN unlock, import).

## Required structure

```tsx
<Drawer open={open} onOpenChange={onOpenChange}>
  <DrawerContent className="sm:max-w-[Npx]" showCloseButton={true}>
    <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
      <DrawerTitle>Title</DrawerTitle>
    </DrawerHeader>
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {/* form fields */}
    </div>
    <DrawerFooter className="border-t border-border">
      {/* Cancel / Save buttons */}
    </DrawerFooter>
  </DrawerContent>
</Drawer>
```

## Width standards

| Width | Use for |
|---|---|
| 480px | 2–3 simple fields |
| 560px | Standard forms (~10 fields) |
| 720px | Complex forms (10–15 fields) |
| 800px | Tabbed editors or multi-section forms |
| 900px | Two-column with journal lines (finance editors) |

## Rules

1. **`showCloseButton={true}` is required on every `DrawerContent`.** Without it, no X button is rendered.
2. **`WideDialogContent` must not be used for editors.** All usages have been removed; the definition remains in `dialog.tsx` only.
3. **After any layout change touching a Drawer, grep for missing `showCloseButton`:**
   ```
   grep -rn "DrawerContent" src/ --include="*.tsx" | grep -v "showCloseButton\|import\|sheet.tsx"
   ```
4. **`ActivityEditDialog` uses custom `hb-drawer` CSS and is a known exception** — do not convert without user instruction.

---

# SSR safety — browser APIs crash the server

Next.js renders pages on the server first. `sessionStorage`, `localStorage`, `window`, and `document` do not exist in Node.js. Accessing them at module load time or in `useState` initialisers throws a `ReferenceError` that crashes SSR.

## Rules

1. **Never access `sessionStorage`, `localStorage`, `window`, or `document` in a `useState` initialiser.** These run at render time on the server.
   ```tsx
   // WRONG — crashes SSR:
   const [val, setVal] = useState(localStorage.getItem('key') ?? '')

   // RIGHT — runs only in the browser:
   const [val, setVal] = useState('')
   useEffect(() => { setVal(localStorage.getItem('key') ?? '') }, [])
   ```
2. **Guard with `typeof window !== 'undefined'`** if you must read a browser API outside of `useEffect`.
3. **Never use `requireSession()` or `requireAdmin()` in API route handlers.** Use `auth()` directly and return `NextResponse.json({ error }, { status })`. (See QA.md §12.12.)

---

# Regression Prevention

See `QA.md` in the project root for:
- Developer blast-radius protocol (§1) — run before ANY change
- Finance accounting invariants (§2) — GL rules an accountant would enforce
- Complete end-to-end lifecycle flows (§4) — bill, income, payslip, journal, opening balances
- Regression smoke tests by module (§5, §10) — run after any finance change
- Accountant verification checklist (§6) — trial balance, P&L, balance sheet, AR/AP, PAYG
- Shared code blast-radius reference (§9) — which files affect which flows
- Known bug patterns to avoid repeating (§12)

**The finance module has critical implications for real money. Always consult QA.md before and after any finance-related change.**
