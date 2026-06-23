# 🏛️ North star — this is a commercial accounting product. Build it like one.

**The finance module must behave exactly as a chartered accountant would expect, and exactly as a commercial accounting product (Xero, MYOB, QuickBooks) behaves. This is the non-negotiable standard against which every finance change is measured.** Not "close enough for a household app." Not "good enough for now." If a qualified accountant sitting at Xero would do it differently, the code is wrong.

What this means in practice:

1. **Correctness is the spec.** Before writing finance code, ask: *what would Xero/MYOB do here, and would an accountant sign off on the resulting ledger?* That answer is the requirement — not an approximation of it. Double-entry must always balance (DR=CR), recognition happens at the correct tax point, period-moving corrections reverse in the old period and repost in the new one, GST/PAYG/super follow Australian GAAP, and the trial balance, P&L, balance sheet, and AR/AP subledgers must always reconcile.

2. **Accounting correctness is fixed NOW, never deferred.** A behaviour that diverges from what a chartered accountant or a commercial product would expect is **not** an out-of-scope "find" to document and defer — it is a defect in the thing you are building, and it gets fixed immediately, in its own commit, like any live-data bug. The "Defer, don't drop" rule below explicitly does **not** apply to finance correctness. Do not stop and ask permission to make the ledger correct; make it correct, then report what you did. (You still serialize finance edits, keep them human-reviewable, and consult QA.md §1/§2/§5 before and after — speed never means skipping the invariant checks.)

3. **"Works like Xero/MYOB" beats "matches the current code."** If the existing code is internally consistent but accounting-wrong, the existing code is the bug. Don't preserve a wrong behaviour for the sake of surgical minimalism — fix it (in its own commit) and note the divergence you corrected.

4. **No half-correct accounting.** A feature that posts the expense but not the matching payable, recognises on the wrong date, or leaves the subledger out of step with the GL is not "partially done" — it is broken and must not ship. Real money depends on it; treat every gap as a stop-ship.

The sections below (shared helpers, finance architecture, blast-radius) are *how* you keep that standard. This section is *the standard itself.* When any other rule appears to conflict with making the accounting correct, the accounting wins.

---

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

## 5. Defer, don't drop — out-of-scope discoveries
When you uncover a bug, smell, or improvement that is **outside the scope of the current task**, do not fix it mid-task — **document it, finish the task, then address it.** Do not silently expand the diff. This protects the original task (it keeps the agent's attention and context budget on what was asked) and keeps every change attributable (if the task's diff regresses something, it should contain one intent, not opportunistic side-fixes).

Deferral is sequencing, not a verdict. The default end-state of a documented find is **fixed, in its own commit, once the current task has landed** — a growing list of documented-but-unfixed issues is a failure of this rule, not compliance with it.

**On discovery, do this instead of fixing:**
1. **Stop and surface it.** Don't keep working past it silently.
2. **Document it thoroughly, right now, while the context is loaded.** This is the most important step. A deferred find is only safe if a future reader (you, another agent, or the user) can act on it cold, without re-deriving everything. The cheap thing to lose later is *what to change*; the expensive thing is *why the code is shaped this way and what breaks if you touch it* — capture that now, because it will be gone in three weeks. A one-line "fix X later" is a trap, not a deferral.
3. **Return to the original task and finish it.**
4. **When the task is complete, address the documented finds.** Fix them in their own commits — one intent per commit, never folded into the task's diff. Safe fixes proceed without asking. Ask the user first only when the fix would change GL output or posted accounting data, alter data semantics, or is otherwise risky enough to need triage.
5. **Log only what genuinely can't be fixed this session** (too large, needs a user decision, blocked). Propose where (follow-up task, a QA.md §12 bug-pattern entry, or an audit-prompt sweep) and let the user triage. Logging is the fallback for what can't be fixed now — not a substitute for fixing.

**A deferred-issue report must contain — do not abbreviate:**
- **Location** — file(s), function/component, and line references. List *every* site if more than one (see instance-vs-class below).
- **Symptom** — what's wrong and how it manifests (or would manifest) to the user / to the GL / to data integrity.
- **Why the code is currently like this** — the constraint, history, or assumption that explains the present shape. This is the context that evaporates; write it down even if it feels obvious today.
- **Failure modes of the naïve fix** — what a careless change would break, what semantics must be preserved, what to test afterward. Name the specific invariant or smoke test (e.g. "must keep DR=CR", "re-run J1–J7", "preserve retry-on-conflict").
- **Blast radius** — what else imports/depends on the affected code (cross-reference QA.md §9 for finance, §1.1 otherwise).
- **Suggested fix direction** — enough of a sketch that the work can start without rediscovery, explicitly marked as a proposal, not a decision.
- **Severity / urgency** — so the user can triage queue position (live data damage vs. cosmetic).

Write the report as if the reader has none of your current context, because they won't. If it's worth a code change later, it's worth a paragraph now.

**Instance vs. class — the most important call at discovery.** Ask: *could this same issue exist elsewhere?* If yes, fixing only the instance in front of you is **actively harmful** — it creates a fixed-here / silently-broken-there divergence, which is worse than a consistently-wrong codebase you can sweep in one pass (this is the §12.7 "fix one instance, miss others" pattern in QA.md). A class-level discovery must be fixed as a dedicated sweep — every known site in one pass, enumerated in the report — never as an inline fix of just the instance in front of you. Like any other find, the sweep runs after the current task is complete.

**The only exceptions — address now, but still isolate and document:**
- Completing the current task **genuinely requires** the fix (the task cannot land correctly without it), or
- The issue is **live damage to real data** (especially finance/GL — see QA.md), or
- The issue is **accounting incorrectness** — the ledger, recognition, GST/PAYG/super, or a subledger does **not** behave as a chartered accountant or a commercial accounting product (Xero/MYOB) would expect. Per the North-star section at the top of this file, finance correctness is **never** a deferable find. Fix it now, in its own commit. Do not document-and-defer it, and do not stop to ask permission merely to make the accounting correct.

In all cases, make the fix, but give it its **own logical change / commit**, note the coupling to the original task in the commit message, and still write the find up (in the commit body or QA.md §12 if it's a new pattern). "Required to proceed" is not a licence to blur two changes into one unattributable diff, nor to skip documentation. Fixing accounting immediately does **not** relax the QA.md §1/§2/§5 invariant checks — run them before and after; "fast" never means "unverified."

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

# API route security — every route guards itself

The app stores sensitive financial and personal data. There is **no `middleware.ts`** — nothing protects a route except the code inside it. A route without an auth check is publicly reachable by anyone on the network. (Audited app-wide 12 Jun 2026; keep it that way.)

## Rules

1. **Every API route starts with an auth check.** Call `auth()` directly and return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` if there is no session (never `requireSession()`/`requireAdmin()` in routes — see SSR safety rule 3).
2. **Admin endpoints need a second check:** `user.role !== 'admin'` → 403. Cross-family admin endpoints use `requireSystemAdmin()` from `src/lib/auth-helpers.ts` (re-reads `isSystemAdmin` from the DB).
3. **Every query is scoped to `user.familyId`.** Fetching a record by ID without `familyId` in the `where` is an IDOR bug — one family can read another's data by guessing IDs. Use `findFirst({ where: { id, familyId } })`, never bare `findUnique({ where: { id } })`.
4. **New public (unauthenticated) routes require explicit user sign-off.** The only legitimate ones: NextAuth, register, password/PIN reset (token-gated), health, VAPID public key, public theme, image cache, and the signed-token email `complete` link. Anything else must be guarded.
5. **Unauthenticated endpoints must not disclose infrastructure** — no file paths, DB details, versions, or raw error messages (e.g. `/api/health` returns status + timestamp only).
6. **Token-guarded break-glass endpoints (e.g. `admin/reset-password`) must be rate-limited and logged.** Use `checkRateLimit` from `src/lib/rate-limit.ts`, log every attempt with IP, and alert the admin (email) on first exceedance per window.
7. **After adding or touching routes, sweep for unguarded ones:**
   ```
   rg --files-without-match "auth\(\)|requireSystemAdmin|ADMIN_RESET_TOKEN|IMAGE_CACHE_TOKEN" -g "route.ts" src/app/api
   ```
   Every hit must be on the known-public list in rule 4 — anything else is a missing guard. (Token-guarded ops routes like `images/uncached`, gated by `IMAGE_CACHE_TOKEN`, are recognised by the token marker — same as `ADMIN_RESET_TOKEN`.)

---

# Subagent & delegation doctrine — fan out reads, funnel writes

This project uses subagents/delegation (Claude Code subagents; Roo Orchestrator → mode
delegation) to go faster **without** weakening blast-radius discipline. The whole policy
reduces to one rule: **parallelize investigation; keep all mutation single-threaded.**

## Why

A single agent thread fills its context with file reads, search results, and side-quests,
and quality degrades as it approaches the window limit. Delegating read-heavy work to a
child with its own context keeps the main thread focused and fast. But parallel *writers*
cannot see each other's diffs — two agents editing a shared lib and its callers at the
same time is exactly the "fix one, miss others" / field-loss class this repo guards against.

## The rule

1. **Reads fan out. Writes funnel.** Investigation, audit, blast-radius scans, "does this
   pattern exist elsewhere", report reconciliation, and post-change verification may run in
   parallel across multiple subagents. **All edits go through ONE parent thread** under the
   normal single-shot approval flow. Never run two write-capable agents concurrently.

2. **Finance is read-only for subagents — no exceptions.** Any subagent touching
   `src/lib/finance-*`, `src/app/api/finance/**`, `src/hooks/finance/**`,
   `prisma/schema.prisma`, or anything posting to the GL operates in **report-only** mode:
   it produces findings (file:function, invariant, evidence, recommendation) and returns
   them. It does **not** edit. The parent applies finance edits itself, consulting QA.md
   §1/§2/§5 before and after, because finance changes have real-money impact and must be
   serialized and human-approved.

3. **Writes are allowed for non-finance work** — tests, docs, UI/components, non-finance
   routes, config — provided rule 1 holds (one writer at a time). A subagent fixing a UI
   component or adding tests may edit; a subagent investigating finance may not.

4. **Subagents inherit the house rules.** Delegation does not relax AGENTS.md or `global.md`:
   surgical diffs, no field loss, tz helpers over UTC midnight, shared logic in `src/lib/`,
   `auth()` in route handlers, the Prisma migration rule. A child agent that doesn't know a
   rule must be given it in its prompt — never assume the child inherited project context.

5. **Delegate when it pays; don't when it doesn't.** Worth it: ≥3 independent files to
   investigate, a blast-radius sweep across modules, an audit-campaign pass, "check the
   mirror module" parity work (bills↔income). Not worth it: a single-file edit, a task that
   needs shared context to make sense, anything where the coordination overhead exceeds the
   work. Parallel agents consume token quota linearly (N agents ≈ N× spend) — fan out for
   wall-clock speed and context hygiene, not reflexively.

6. **Child prompts must be self-contained and bounded.** State the exact scope, the invariant
   or property to check, what to return, and the read-only/write boundary. A child with a
   vague brief samples and guesses — the same failure as an unbounded "audit the module" ask.

## Tooling map (where this is configured)

- **Claude Code:** project subagents in `.claude/agents/*.md` (Markdown + YAML frontmatter).
  Finance/audit/scout agents omit `Edit`/`Write`/`Bash` from their `tools:` list so they are
  read-only by construction. The parent session orchestrates and owns all edits.
- **Roo Code:** the built-in 🪃 **Orchestrator** mode delegates via `new_task` to specialized
  modes; registered in `.roomodes` and detailed in `.roo/prompts/modes/`. Finance-audit and
  investigator modes have restricted `groups` (no `edit`) so they cannot write.

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
