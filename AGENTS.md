# HomeBase — agent rules

Household management app (chores, contacts, docs, events, lists, meal plan, notes, recipes, finance). Next.js 16 (forked — see below), NextAuth v5, Prisma + SQLite, Luxon. Tenancy key: `familyId`.

**Commands:** `npm run dev` (port 3300) · `npm test` (vitest run) · `npx tsc --noEmit` (required before/after every change) · `npm run lint` (eslint). Deploy/build: `.roo/prompts/build-deploy-guide.md`. Regression protocol: `QA.md`.

---

# 🏛️ North star — the finance module is a commercial accounting product

**Finance must behave exactly as a chartered accountant would expect and as Xero/MYOB/QuickBooks behave.** Not "close enough for a household app." If a qualified accountant at Xero would do it differently, the code is wrong.

1. **Correctness is the spec.** Ask *what would Xero/MYOB do, and would an accountant sign off on the resulting ledger?* DR=CR always; recognition at the correct tax point; period-moving corrections reverse in the old period and repost in the new; GST/PAYG/super per Australian rules; trial balance, P&L, balance sheet and AR/AP subledgers always reconcile.
2. **"Works like Xero" beats "matches the current code."** Internally consistent but accounting-wrong code is the bug. Fix it and note the divergence you corrected.
3. **No half-correct accounting.** Posting the expense but not the payable, recognising on the wrong date, or leaving a subledger out of step with the GL is broken, not partial. Stop-ship.
4. **Accounting bugs are never deferred** — they are fixed in this session, in their own commit (the "Defer, don't drop" rule below does not apply to them).

## Finance change tiers — how much ceremony each change needs

The ledger is critical, but not every finance edit is a ledger migration. Match the process to what the change can actually damage:

| Tier | What it is | Ask first? | Verification |
|---|---|---|---|
| **1. UI / read-only** | Finance pages, display, filters, report formatting — no change to what is posted | No | `tsc` + eyeball the affected screen |
| **2. Posting logic, future only** | Fix or change how *new* journals/bills/income/payslips post; a route or one flow's lib code | **No — fix, verify, report** | QA.md §5 smoke test for the touched flow(s); DR=CR on what it creates; check the bills↔income mirror |
| **3. Shared GL core** | `finance-posting.ts`, draft spawn/approval services, reversal helpers, `prisma/schema.prisma` finance models | No, but say up front what you're changing | QA.md §1.1 blast-radius + §2 invariants before; full §5 lifecycle (spawn → approve → post → pay → void) after |
| **4. Posted data / closed periods** | Anything that changes already-posted journals or past-period report output: data migrations, backfills, re-posting, re-keying | **Yes — confirm with the user before running** | Before/after trial balance comparison; script is dry-run first |
| **5. Destructive / bulk** | Deleting or wiping finance data, bulk scripts against prod/dev DB | **Always confirm** | Backup exists; dry-run output shown |

Rules that hold at every tier: finance edits are made by the parent thread only (never a subagent), one at a time, each in its own commit noting the lifecycle stage affected. Read QA.md §12 anti-patterns (esp. 12.1, 12.2, 12.7, 12.9, 12.20) before tier 2+.

## Finance architecture
- **GL posting lives in `src/lib/` helpers only** (`postBillAccrualJournal`, `upsertBillDraftJournal`, …) — never inline in a route. Missing helper? Create it first.
- **Pages never compute balances or post journals** — they call APIs.
- **One fix, one place.** Same accounting logic in two files → extract first, then fix.
- **Bills and income are mirror modules.** `api/finance/bills/route.ts` and `api/finance/income/route.ts` share lifecycle code (draft spawn, receipt/payment, GL posting, cancel, void, GET status filters, template cursor, approval). A bug in one is almost certainly in the other — check both, every time.

---

# Defer, don't drop — out-of-scope discoveries

Found a bug or smell outside the current task (and it's not an accounting bug)? Don't fix it mid-task. **Surface it, write it up, finish the task, then fix it in its own commit.** Deferral is sequencing, not a verdict — the default end-state of a find is *fixed this session*. Safe fixes proceed without asking; ask only when the fix changes data semantics or posted data (tier 4/5 above). Log for later only what genuinely can't be done now (too large, needs a decision, blocked).

- **Write it up properly** — a one-line "fix X later" is a trap. Use the template in QA.md §1.5 (location, symptom, why the code is like this, naïve-fix failure modes, blast radius, fix direction, severity).
- **Instance vs. class.** Could the same issue exist elsewhere? If so, fix it as one sweep over every site — fixing only the instance in front of you creates a fixed-here/broken-there divergence (QA.md §12.7).
- **Exceptions — fix now, still in its own commit:** the task can't land without it; live damage to real data; or accounting incorrectness (North star §4).

---

# Timezone — all date logic is local time, via `src/lib/timezone.ts` (Luxon)

Server and DB are UTC; the user is Australia/Sydney (UTC+10/+11). Every date boundary, filter and display is computed in the user's zone **through the helpers in `src/lib/timezone.ts`**. Routes/components never call Luxon `DateTime` or raw `Date` math directly, and **never import `date-fns`** (being retired).

```ts
const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
// UTC+10 on 2026-05-23 → todayStart = 2026-05-22T14:00:00Z, NOT 2026-05-23T00:00:00Z
const endDate = nDaysFromTodayInTz(7, timezone)          // rolling window end
const { start: monthStart, end: monthEnd } = monthBoundsInTz(timezone)
const label = formatInTz(date, timezone, { weekday: 'short', day: 'numeric', month: 'short' })
const onDay = eventFallsOnDay(event, day, timezone)      // src/lib/event-helpers.ts
```

1. Never use `new Date('YYYY-MM-DDT00:00:00Z')` or `normalizeToUtcMidnight()` as a "today" boundary — it's 10–11 h late and drops events.
2. Never bucket events by parsing `event.end` locally — synthetic all-day events end `T23:59:59Z` (09:59 next day local) and duplicate across two days. Use `eventFallsOnDay`.
3. `todayStart` is the single source of truth; window ends use `nDaysFromTodayInTz`; in-code filters use the same boundaries as the DB query.
4. Display with `formatInTz` — never `toLocaleDateString()` / date-fns `format()` without a zone.
5. **Exception:** meal plan dates are stored as UTC midnight of the calendar date; display them with `zone: 'utc'`.
6. Test new date logic across the Australian DST transitions (Oct, Apr).

OS/container `TZ` (cron, log timestamps) is an infra concern — see the build-deploy guide; don't conflate it with app date logic.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Shared helpers over inline logic — app-wide

**Domain logic lives in `src/lib/` and is called from there. Routes do auth → parse → call helper → respond. Pages render and call APIs.** Inline copies (chore completion/rotation, GL posting, date math) are this codebase's #1 source of recurring bugs: they drift, a fix lands in one copy, and the bug is "found again" months later.

- Before writing logic in a route, grep for a helper. None? Create it in `src/lib/` first.
- Two copies is one too many — extract on the second, not the third.
- Server/client split: helpers that use `prisma`/`auth` are server-only; client-imported helpers stay pure (pattern: `chore-helpers.ts` pure + `chore-completion.ts` DB).
- Only exception: one-off glue with no reusable logic — say why in one line.
- Before finishing, grep `src/` for the operation you wrote; more than one file → make it a helper.

---

# Forms, dialogs, editors — no silent field loss

Layout refactors have repeatedly dropped fields from the UI.

1. **Before editing, list every `<input>`, `<select>`, `<textarea>` and checkbox** — including ones behind conditionals. **After editing, verify every one is still present.**
2. **Never remove a field without explicit instruction** — move it, don't drop it. No "preview-only" read-only replacements unless asked.
3. **New form mirroring a model:** read the model in `prisma/schema.prisma`; the TS interface matches what the GET route returns; `openEdit`/`openNew` assigns every interface field; PATCH/PUT sends every editable field; the API handler accepts every field sent.
4. **Layout changes** (tabs, columns, accordions, scroll regions): every section must be reachable, not just theoretically scrollable — split into independently scrolling panes rather than merging scroll regions that may not fit.

# Drawers

Editors, detail panels and complex dialogs use the right-side Drawer from `@/components/ui/sheet`; centred `Dialog` only for ≤2-field confirms (void, delete, PIN unlock, import).

```tsx
<Drawer open={open} onOpenChange={onOpenChange}>
  <DrawerContent className="sm:max-w-[Npx]" showCloseButton={true}>
    <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border"><DrawerTitle>Title</DrawerTitle></DrawerHeader>
    <div className="flex-1 overflow-y-auto px-4 py-3">{/* fields */}</div>
    <DrawerFooter className="border-t border-border">{/* Cancel / Save */}</DrawerFooter>
  </DrawerContent>
</Drawer>
```

Widths: 480px (2–3 fields) · 560px (~10) · 720px (10–15) · 800px (tabbed/multi-section) · 900px (two-column with journal lines). `showCloseButton={true}` is required on every `DrawerContent` — check with `grep -rn "DrawerContent" src/ --include="*.tsx" | grep -v "showCloseButton\|import\|sheet.tsx"`. Don't use `WideDialogContent` for editors. `ActivityEditDialog` (custom `hb-drawer` CSS) is a known exception — don't convert unasked.

# SSR safety

Never touch `localStorage`, `sessionStorage`, `window` or `document` in a `useState` initialiser or at module load — it crashes SSR. Read them in `useEffect`, or guard with `typeof window !== 'undefined'`.

---

# API route security — every route guards itself

There is **no `middleware.ts`**; a route without its own check is public. (Audited app-wide 12 Jun 2026 — keep it that way.)

1. Start every handler with `auth()` → `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`. **Never `requireSession()`/`requireAdmin()` in route handlers** (QA.md §12.12).
2. Admin routes also check `user.role !== 'admin'` → 403. Cross-family admin uses `requireSystemAdmin()` (`src/lib/auth-helpers.ts`, re-reads `isSystemAdmin` from the DB).
3. Every query is scoped to `user.familyId` — `findFirst({ where: { id, familyId } })`, never bare `findUnique({ where: { id } })` (IDOR).
4. Wrap every exported handler: `async function _GET(...)` + `export const GET = withRouteErrors(_GET)` (`src/lib/route-errors.ts`) so a throw returns JSON 500, not an empty body.
5. **Known public routes** (anything else new needs user sign-off): NextAuth, register, password/PIN reset (token-gated), health (status + timestamp only — no paths, versions, raw errors), VAPID public key, public theme, image cache, signed-token email `complete` link.
6. Token-guarded break-glass routes (`admin/reset-password`) are rate-limited via `checkRateLimit` (`src/lib/rate-limit.ts`), log every attempt with IP, and email the admin on first exceedance.
7. After touching routes, sweep — every hit must be on the public list:
   ```
   rg --files-without-match "auth\(\)|requireSystemAdmin|ADMIN_RESET_TOKEN|IMAGE_CACHE_TOKEN" -g "route.ts" src/app/api
   ```

---

# Subagents — fan out reads, funnel writes

- **Reads fan out:** investigation, blast-radius sweeps, bills↔income parity checks and post-change verification can run in parallel subagents.
- **Writes funnel:** one writer at a time, in the parent thread. Non-finance subagents may edit (tests, docs, UI) only if no other writer is active.
- **Finance is report-only for subagents** — anything under `src/lib/finance-*`, `src/app/api/finance/**`, `src/hooks/finance/**`, `prisma/schema.prisma`, or posting to the GL. They return findings (file:function, invariant, evidence, recommendation); the parent applies edits per the tiers above.
- **Child prompts are self-contained:** exact scope, property to check, what to return, read/write boundary, and any house rule the task touches — children don't inherit project context.
- **Delegate when it pays** (≥3 independent files, cross-module sweeps, audit passes), not for single-file edits. N agents ≈ N× token spend.
- Config: Claude Code agents in `.claude/agents/*.md` (finance/audit/scout agents have no Edit/Write/Bash); Roo Orchestrator modes in `.roomodes` + `.roo/prompts/modes/`.

---

# Regression prevention — QA.md

QA.md is **not** auto-loaded; read the relevant section before finance work. §1 blast-radius protocol + commit rules (§1.5 deferred-issue template) · §2 accounting invariants · §4 lifecycle flows · §5/§10 smoke tests · §6 accountant checklist · §9 shared-code blast-radius map · §12 known bug patterns.

# Code navigation

Codebase Memory MCP (if connected): prefer graph tools (`search_graph`, `trace_call_path`, `detect_changes`) for structure and blast radius; Grep/Read for exact text. If it's unavailable, say so once and continue with Grep/Read.

# Done and commits

- `npx tsc --noEmit` clean; tests for touched modules pass (`npx vitest run <path>`).
- Walk the feature from the user's chair before reporting done: every site it appears (add/edit/bulk/paste/settings/filters/archived), default and empty states, full lifecycle (create → change → reorder → rename → remove → undo), natural gestures (drag, multi-select, paste, mobile tap), offline. State the walk-through and any known gap with a recommendation in the summary — one complete pass, not five builds.
- Commit only when asked; branch off `master`; `git commit -F <file>`; prefixes per QA.md §1.4.
