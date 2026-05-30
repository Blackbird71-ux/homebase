# Code Duplication & Consolidation Audit

**Date:** 2026-05-30
**Scope:** Entire `src/` tree — inline code that duplicates an existing `src/lib/` helper, and inline logic repeated across ≥2 files that warrants a new helper.
**Mode:** PARTIALLY REMEDIATED. Findings 2, 3, 4, 5, 6, 7 executed 2026-05-30 (see **Remediation status** below). Finding 1 + a newly-found hardcoded-display-zone follow-up are **deferred to the next batch**.

**Related prior reports (do not re-litigate; this audit is duplication-specific):**
- [`docs/helper-separation-audit-report.md`](helper-separation-audit-report.md) — page→hook/lib separation (2026-05-15)
- [`docs/finance-pages-inline-code-audit-report.md`](finance-pages-inline-code-audit-report.md) — finance page inline logic (2026-05-16)

---

## Executive summary

| # | Finding | Bucket | Severity | Money/Dates? |
|---|---------|--------|----------|--------------|
| 1 | `upsertBillDraftJournal` ↔ `upsertIncomeJournalEntry` — twin inline GL upserts; both re-implement `finance-posting.ts` primitives | ii (diverged) | **CRITICAL** | Money + GL |
| 2 | `computeNextOccurrenceDate` (server) ↔ `nextOccurrence` (client) — recurrence date math diverged for yearly+monthOfYear | ii (diverged) | **CRITICAL** | Dates |
| 3 | `postBillPaymentToGL` (inline) duplicates shared `postBillPaymentJournal` — and appears to be **dead code** | i / dead | High | Money + GL |
| 4 | `postIncomeReceiptJournal` shared helper is **unused**; income receipt posts inline instead | iii (inverse) | High | Money + GL |
| 5 | Family-timezone fetch + default fallback repeated ~18× — and the default **diverges** (`Sydney` vs `Brisbane`) | iii / diverged | Medium | Dates |
| 6 | AI tools re-implement `dateStringInTz`/`todayStringInTz` inline (5 sites) | i | Low | Dates |
| 7 | AUD currency formatting inlined ~23× instead of `formatCurrency` | i | Low | Display |

The headline is **#1 + #2**: two pairs of near-identical functions where the copies have diverged. #2 is a **live latent bug** (the preview UI shows a different date than the spawner produces). #1 is not a live bug today but is a structural time-bomb under QA.md §12.7 (fix-one-miss-others) and directly violates AGENTS.md "Never write GL posting logic inline in an API route".

---

## Remediation status (updated 2026-05-30)

### ✅ Executed this batch

| Finding | Step | What landed | Verification |
|---|---|---|---|
| **2** (recurrence divergence) | 1 (+ the "extract shared stepping" follow-up) | New client-safe [`src/lib/finance-recurrence-core.ts`](../src/lib/finance-recurrence-core.ts) (`stepOccurrence` + `applyDayOfMonth`); server `computeNextOccurrenceDate` **and** client `nextOccurrence` both delegate to it; `date-fns` removed from the server template-service file (improves the "no date-fns server-side" rule). **Adopted server semantics** (yearly + `monthOfYear` resets day to 1) so the preview now matches the spawner. | 17-case Vitest suite [`src/lib/__tests__/finance-recurrence-core.test.ts`](../src/lib/__tests__/finance-recurrence-core.test.ts) — all pass. `tsc` clean. |
| **4** (`postIncomeReceiptJournal` unused) | 4 | Income simple-receipt (MODE B) now posts through the shared `postIncomeReceiptJournal` helper instead of inline create. | Helper byte-matches the prior inline block; adds only `assertBalanced`/GL-family safety + `amount>0` guard (parity with MODE A payslip path). `tsc` clean. |
| **5** (family-tz fetch + diverging default) | 5 | Added `DEFAULT_TIMEZONE = 'Australia/Sydney'` to [`src/lib/timezone.ts`](../src/lib/timezone.ts) + `getFamilyTimezone(familyId)` in new [`src/lib/family.ts`](../src/lib/family.ts); migrated the ~18 fetch/fallback sites; **unified the spawn-path default to Sydney** (Brisbane fallbacks removed). Family's saved tz always wins; the constant is only the null-fallback. | Cron *fire-time* tz (`Australia/Brisbane` in `spawnScheduler`/`reportScheduler`) and the `SUPPORTED_TIMEZONES` allow-list left intact. `tsc` clean. |
| **7** (AUD formatting inlined) | 6 (Option B) | Extended `formatCurrency(n, options?)` in [`src/lib/financeShared.ts`](../src/lib/financeShared.ts); migrated the inline `Intl.NumberFormat('en-AU', …)` sites including the whole-dollar (`maximumFractionDigits: 0`) variants. | `tsc` clean; display-only. |
| **3** (dead `postBillPaymentToGL`) | 3 | Deleted the unused inline `postBillPaymentToGL` (~42 lines, comment + body) from [`bills/route.ts`](../src/app/api/finance/bills/route.ts) — repo-wide grep confirmed **zero callers**; the live payment leg posts via shared `postBillPaymentJournal` in `bills/[id]/payments/route.ts`. Fixed the stale `finance-posting.ts` header reference (also noted `postBillToGL` was already gone). | Grep: 0 callers. `tsc` clean (`--incremental false`). Pure dead-code removal — no behavioural change. |
| **6** (AI tools inline date-strings) | 7 | Migrated the 5 inline `toLocaleDateString('en-CA', { timeZone })` sites (orchestrator, context-builder, birthdays, digest, calendar) to `dateStringInTz`/`todayStringInTz` from [`src/lib/timezone.ts`](../src/lib/timezone.ts). Sites holding a captured `now`/`e.start` use `dateStringInTz(var, tz)` to preserve the exact timestamp (so digest.tool.ts:152 used `dateStringInTz(now, …)`, not the audit's literal `todayStringInTz` which would re-read the clock); the two bare `new Date()` sites use `todayStringInTz(tz)`. **Left `meal-plan.tool.ts:178` (`timeZone: 'UTC'`) untouched** — the meal-plan UTC-midnight exception. | Helpers byte-match the inline calls. `tsc` clean. |

> **Decision recorded (Finding 5 / Step 5 judgment call):** the spawn paths' `Australia/Brisbane` default was **not** a deliberate DST-stable choice worth preserving — per the user, "we should be using the family tz as it will be correct for each family and easily changed in settings. I am not a fan of hard coded items that should be a setting." Unified to a single `DEFAULT_TIMEZONE` (Sydney); the family's own setting is the source of truth.

### ⏭️ Deferred to next batch

| Finding | Step | Why deferred |
|---|---|---|
| **1** — `upsertBillDraftJournal` ↔ `upsertIncomeJournalEntry` twin GL upserts (**CRITICAL**) | 2 | Highest-value but highest-risk (real money + GL). Needs `assertBalanced`/`assertGlAccountsBelongToFamily` exported + a new `upsertDraftJournal({…, isPosted})`, then **both** lifecycle smokes (QA.md §2 + §5, the bill↔income parity gate). Kept for a focused session. |

### 🆕 New follow-up found during Step 5 — hardcoded display timezones (next batch)

These sites hardcode a display-zone **literal** but do **not** follow the `family?.timezone ?? default` pattern, so they were outside Finding 5's mechanical migration. Per the user's "no hardcoded settings" principle they should be routed through `getFamilyTimezone` (server) / `useFamilyTimezone` (client) so the family's saved setting drives the displayed local time:

- [`src/lib/utils.ts:18`](../src/lib/utils.ts#L18)
- [`src/lib/financeReport.ts:113`](../src/lib/financeReport.ts#L113) and [`:205`](../src/lib/financeReport.ts#L205)
- [`src/components/finance/GeneratePdfDialog.tsx:147`](../src/components/finance/GeneratePdfDialog.tsx#L147)
- [`src/app/(app)/finance/balance-sheet/page.tsx:219`](../src/app/(app)/finance/balance-sheet/page.tsx#L219)
- [`src/app/(app)/finance/profit-loss/page.tsx:163`](../src/app/(app)/finance/profit-loss/page.tsx#L163)

---

## Bucket (i) — Exact duplicate of an existing helper → replace with the call

### Finding 6 — AI tools re-implement `dateStringInTz` / `todayStringInTz`

**Severity:** Low (behaviour is identical; this is a consistency/maintainability issue, not a bug).

**Existing helper:** `dateStringInTz(date, tz)` and `todayStringInTz(tz)` — [`src/lib/timezone.ts:139`](../src/lib/timezone.ts#L139) and [`:105`](../src/lib/timezone.ts#L105). Both are literally `X.toLocaleDateString('en-CA', { timeZone })`.

**Inline occurrences** (all spell out the same `toLocaleDateString('en-CA', { timeZone: timezone })`):
- [`src/lib/ai/orchestrator.ts:21`](../src/lib/ai/orchestrator.ts#L21) — `now.toLocaleDateString(...)` → `dateStringInTz(now, userTimezone)`
- [`src/lib/ai/context-builder.ts:34`](../src/lib/ai/context-builder.ts#L34) — `new Date().toLocaleDateString(...)` → `todayStringInTz(timezone)`
- [`src/lib/ai/tools/birthdays.tool.ts:63`](../src/lib/ai/tools/birthdays.tool.ts#L63) → `todayStringInTz(timezone)`
- [`src/lib/ai/tools/digest.tool.ts:152`](../src/lib/ai/tools/digest.tool.ts#L152) → `todayStringInTz(timezone)`
- [`src/lib/ai/tools/calendar.tool.ts:139`](../src/lib/ai/tools/calendar.tool.ts#L139) — `e.start.toLocaleDateString(...)` → `dateStringInTz(e.start, timezone)`

**Agree or diverge?** All agree exactly. (Note: [`meal-plan.tool.ts:178`](../src/lib/ai/tools/meal-plan.tool.ts#L178) uses `timeZone: 'UTC'` — this is the **meal-plan UTC-midnight exception** from AGENTS.md and must NOT be changed.)

**Risk if left:** Low. But these are the exact call-sites a future "we changed how local dates are derived" fix would need to touch, and inline copies make that fix easy to miss.

---

### Finding 7 — AUD currency formatting inlined instead of `formatCurrency`

**Severity:** Low (display-only; all copies agree).

**Existing helper:** `formatCurrency(n)` — [`src/lib/financeShared.ts:149`](../src/lib/financeShared.ts#L149):
```ts
return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
```

**Inline occurrences (~23)** — each constructs `new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })` locally:
- [`src/components/dashboard/BillsToPayCard.tsx:10`](../src/components/dashboard/BillsToPayCard.tsx#L10)
- [`src/components/finance/CategorySpendView.tsx:39`](../src/components/finance/CategorySpendView.tsx#L39)
- [`src/components/finance/CategoryRow.tsx:147`](../src/components/finance/CategoryRow.tsx#L147)
- [`src/components/finance/AccountLedgerPanel.tsx:26`](../src/components/finance/AccountLedgerPanel.tsx#L26) and [`:407`](../src/components/finance/AccountLedgerPanel.tsx#L407)
- [`src/components/finance/TaxReportComponents.tsx:73`](../src/components/finance/TaxReportComponents.tsx#L73)
- [`src/app/api/complete/route.ts:138`](../src/app/api/complete/route.ts#L138)
- [`src/app/api/finance/export/print/route.ts:11`](../src/app/api/finance/export/print/route.ts#L11)
- [`src/lib/excel/tax-report-excel.ts:98`](../src/lib/excel/tax-report-excel.ts#L98)
- [`src/lib/emailReportService.ts:43`](../src/lib/emailReportService.ts#L43)
- [`src/lib/email-templates.ts:143`](../src/lib/email-templates.ts#L143)
- Finance pages: `annual-pnl:34`, `accounts:129`, `bas:80`, `balance-sheet:96`, `budget:61`, `goals:76`, `OverviewClient:72`, `profit-loss:22`, `reports:65`, `vendor-statement:39`, `trial-balance:31`

**Agree or diverge?** The majority agree exactly. **A subset diverges by intent** — they pass extra options such as `maximumFractionDigits: 0` (whole-dollar display). `formatCurrency(n)` takes **no options argument**, so those sites cannot adopt it as-is.

> **Judgment call (presented, not decided):**
> - **Option A:** Replace only the exact-match sites; leave the `maximumFractionDigits` variants inline. Smallest change, but leaves two patterns.
> - **Option B:** Extend the helper to `formatCurrency(n, options?: Intl.NumberFormatOptions)` and migrate all sites. One pattern everywhere, but touches the shared signature (low risk — purely additive).
>
> Recommendation: **Option B** — additive, and it captures the whole-dollar variants too. Decide before executing.

---

## Bucket (ii) — Near-duplicate that has DIVERGED → likely latent bug

### Finding 1 — `upsertBillDraftJournal` ↔ `upsertIncomeJournalEntry` (twin inline GL upserts) — **CRITICAL**

**Severity:** CRITICAL — money + GL, and it violates two hard rules: AGENTS.md "Never write GL posting logic inline in an API route" and Finance rule 5 (bills↔income parity). See QA.md §12.7.

**The two copies (~90 lines each, near-identical):**
- [`src/app/api/finance/bills/route.ts:91`](../src/app/api/finance/bills/route.ts#L91) `upsertBillDraftJournal`
- [`src/app/api/finance/income/route.ts:46`](../src/app/api/finance/income/route.ts#L46) `upsertIncomeJournalEntry`

**What they re-implement that already exists in [`src/lib/finance-posting.ts`](../src/lib/finance-posting.ts):**
| Inline logic | Lines (bill / income) | Already exists as |
|---|---|---|
| Balance check `Math.abs(DR−CR) > 0.005` | 114–121 / 68–77 | `assertBalanced` ([`finance-posting.ts:68`](../src/lib/finance-posting.ts#L68), `BALANCE_EPSILON=0.005`) — currently **private/unexported** |
| GL-account-belongs-to-family validation | 104–112 / 58–66 | `assertGlAccountsBelongToFamily` ([`finance-posting.ts:90`](../src/lib/finance-posting.ts#L90)) — currently **private/unexported** |
| Posted-entry guard ("never modify a posted JE in place") | 151–159 / 107–115 | duplicated comment + `throw` in both routes |
| Atomic delete-lines + recreate in `$transaction` | 130–179 / 86–135 | no shared equivalent (upsert-draft semantics) |

**Divergence (the money-sensitive line):**
- Bill writes **`isPosted: false`** on both update ([`:144`](../src/app/api/finance/bills/route.ts#L144)) and create ([`:171`](../src/app/api/finance/bills/route.ts#L171)).
- Income writes **`isPosted: isBalanced`** on both update ([`:100`](../src/app/api/finance/income/route.ts#L100)) and create ([`:127`](../src/app/api/finance/income/route.ts#L127)). Because the function throws when unbalanced ([`:73`](../src/app/api/finance/income/route.ts#L73)), `isBalanced` is **always `true`** here — i.e. income posts to the GL immediately, bills create an unposted draft.

**Is the divergence a bug? — No, it is by design.** Bills accrue as a *draft* pending invoice-received / approval (promoted later by the shared `postBillAccrualJournal`); income recognises immediately on save. The divergence is the intended lifecycle difference, **not a live defect.**

**The real risk (why this is still CRITICAL):** the *surrounding* ~80 lines (balance check, GL-family validation, posted-entry guard, atomic upsert) are copy-paste twins. A future correctness fix to any of that logic applied to one route will silently miss the other — the exact failure mode QA.md §12.7 documents and the "BUG C hardening" comments (added to *both* by hand) already demonstrate. The `isPosted` behaviour should become an explicit parameter of one shared function, not an emergent property of two divergent copies.

**Note — finance-posting.ts already anticipates this.** Its header explicitly states the shared posting helpers were written "PARALLEL to the in-route posting code … so the audited posting logic in the existing routes is not touched." That deliberate parallelism is the debt this finding proposes to retire.

---

### Finding 2 — recurrence date math: `computeNextOccurrenceDate` ↔ `nextOccurrence` diverged — **CRITICAL (live latent bug)**

**Severity:** CRITICAL — dates, and it produces a **user-visible mismatch between the preview and the actual spawn**.

**The two copies:**
- Server / spawner (source of truth): `computeNextOccurrenceDate` — [`src/lib/finance-recurring-template-service.ts:126`](../src/lib/finance-recurring-template-service.ts#L126)
- Client / preview UI: `nextOccurrence` — [`src/lib/finance-recurrence-utils.ts:25`](../src/lib/finance-recurrence-utils.ts#L25)

Both also carry a duplicated `applyDayOfMonth` ([template-service:86](../src/lib/finance-recurring-template-service.ts#L86) vs [recurrence-utils:15](../src/lib/finance-recurrence-utils.ts#L15)) — those two **agree**.

**Divergence — the `yearly` + `monthOfYear` branch:**
- **Server** ([`:162–172`](../src/lib/finance-recurring-template-service.ts#L162)): `next = new Date(next.getFullYear(), jsMonth, 1)` — **resets day-of-month to 1**, then applies `dayOfMonth` snap *only if `dayOfMonth` is set*.
- **Client** ([`:48–51`](../src/lib/finance-recurrence-utils.ts#L48)): `next = new Date(next.getFullYear(), monthOfYear - 1, next.getDate())` — **keeps the stepped day-of-month**, then applies `dayOfMonth` snap only if set.

**Concrete failure:** a yearly template with `monthOfYear` set but `dayOfMonth` **not** set:
- Server spawns on **day 1** of the target month.
- Client preview shows the **stepped day** (e.g. the start date's day).

The preview UI therefore lies about when the draft will actually appear.

**Which version is correct?** The **server is canonical** — it is what actually spawns. The client `nextOccurrence` `monthOfYear` branch is the incorrect copy. (The file header openly notes the two "are kept separate to avoid regression" — acknowledged debt.)

**Risk if left:** users planning around the preview see wrong dates for yearly-with-month templates; erodes trust in the spawn engine. Low frequency (only yearly + monthOfYear-without-dayOfMonth) but squarely a dates bug.

---

## Bucket (iii) — Repeated inline logic with no helper → extract

### Finding 5 — Family-timezone fetch + default fallback (repeated ~18×, default diverges)

**Severity:** Medium — the repetition is mechanical, but the **default value diverges** in a way that is currently latent-but-real.

**Repeated pattern** (`prisma.family.findUnique({ select:{ timezone:true }})` then `family?.timezone ?? '<default>'`):

*Default `'Australia/Sydney'` (~15 sites):* [`accounts-receivable:65–67`](../src/app/api/finance/accounts-receivable/route.ts#L65), [`accounts-payable:66–68`](../src/app/api/finance/accounts-payable/route.ts#L66), [`bas:65–68`](../src/app/api/finance/bas/route.ts#L65), [`balance-sheet:75–77`](../src/app/api/finance/balance-sheet/route.ts#L75), [`trial-balance:89–91`](../src/app/api/finance/trial-balance/route.ts#L89), [`pnl:61–64`](../src/app/api/finance/pnl/route.ts#L61), [`pnl/batch:37–39`](../src/app/api/finance/pnl/batch/route.ts#L37), [`export/print:26–29`](../src/app/api/finance/export/print/route.ts#L26), [`export/excel:29–32`](../src/app/api/finance/export/excel/route.ts#L29), [`categories/[id]/ledger:96`](../src/app/api/finance/categories/[id]/ledger/route.ts#L96), `reportScheduler:95`, `finance/templates/page:13`, `settings/general:20`, plus `finance-recurring-template-service:767`.

*Default `'Australia/Brisbane'` (3 sites):* [`spawnScheduler.ts:69`](../src/lib/spawnScheduler.ts#L69), [`admin/spawn-now:36`](../src/app/api/admin/spawn-now/route.ts#L36), and the spawn path generally.

**Divergence:** Sydney vs Brisbane. Both are UTC+10 *today*, so behaviour is currently identical — **but Brisbane has no DST and Sydney does.** During NSW daylight-saving (Oct–Apr, UTC+11) the two defaults disagree by an hour for any family with a null `timezone`. That is a latent dates bug hiding behind a copy-paste default.

**Proposed helper:**
- Export `DEFAULT_TIMEZONE = 'Australia/Sydney'` from [`src/lib/timezone.ts`](../src/lib/timezone.ts) (pick ONE default — decide Sydney vs Brisbane during execution).
- Add `getFamilyTimezone(familyId: string): Promise<string>` — single fetch + fallback. Lives in a server helper (e.g. `src/lib/family.ts` or alongside finance helpers, since most callers are finance routes).

> **Judgment call:** the spawn paths intentionally chose Brisbane (DST-stable spawning). If that was deliberate, the helper needs an explicit `{ dstStable?: boolean }` or a separate `SPAWN_DEFAULT_TIMEZONE` constant rather than silently unifying to Sydney. **Confirm intent before unifying.**

---

## Additional observations — unused / dead shared code (MENTION ONLY, per "don't delete dead code without instruction")

### Finding 3 — `postBillPaymentToGL` is an inline duplicate of `postBillPaymentJournal`, and is dead

- Inline: [`src/app/api/finance/bills/route.ts:40`](../src/app/api/finance/bills/route.ts#L40) `postBillPaymentToGL`.
- Shared canonical: [`postBillPaymentJournal`](../src/lib/finance-posting.ts#L321) — actively used by [`bills/[id]/payments/route.ts:194`](../src/app/api/finance/bills/[id]/payments/route.ts#L194).
- **A repo-wide grep finds no caller of `postBillPaymentToGL`** (only its definition + a stale reference in the finance-posting.ts header comment). It is **dead code** — a ~50-line inline copy of payment-posting logic superseded by the shared helper.
- **Recommendation:** delete `postBillPaymentToGL` (subject to your confirmation — flagged, not removed).

### Finding 4 — `postIncomeReceiptJournal` (shared) is unused; income posts receipts inline

- Shared helper [`postIncomeReceiptJournal`](../src/lib/finance-posting.ts#L599) (DR Bank / CR AR) has **no caller anywhere** in `src/`.
- The income route imports only [`postPayslipReceiptJournal`](../src/app/api/finance/income/route.ts#L10) from finance-posting (used correctly at [`:945`](../src/app/api/finance/income/route.ts#L945) — this is the one income path that *does* use the shared module). Simple-income accrual/receipt is handled by the inline `upsertIncomeJournalEntry` instead.
- This is the inverse of Finding 1: a vetted shared helper exists but the live route bypasses it. **Recommendation:** wire income's simple-receipt path through `postIncomeReceiptJournal`, or remove the unused helper. Flagged for decision.

### Minor — `toPeriodAmount` vs `timesPerMonth`/`toMonthlyAmount`

[`finance-period.ts` `toPeriodAmount`](../src/lib/finance-period.ts) inlines `weekly = 52/12`, `fortnightly = 26/12` etc.; [`financeShared.ts`](../src/lib/financeShared.ts) has `timesPerMonth` + `toMonthlyAmount`. These are *related but not identical* operations (convert-to-monthly vs convert-to-arbitrary-period). Low priority; note only — not a clean dedupe.

---

## Prioritised consolidation plan (step-by-step, for an executing agent)

> Execute in order. Each step is independently shippable. **Do not start until execute permission is granted.** Re-baseline with `npx tsc --noEmit` before step 1.

### Step 1 — Fix the live recurrence bug (Finding 2) `[CRITICAL, smallest blast radius]`
1. In [`finance-recurrence-utils.ts:48–51`](../src/lib/finance-recurrence-utils.ts#L48), change the client `nextOccurrence` `monthOfYear` branch to match the server: reset day to 1 before the `dayOfMonth` snap, i.e. `next = new Date(next.getFullYear(), monthOfYear - 1, 1)` then apply `applyDayOfMonth` only if `dayOfMonth` is set — mirroring [`finance-recurring-template-service.ts:162–172`](../src/lib/finance-recurring-template-service.ts#L162).
2. **Verify:** create a yearly template with `monthOfYear` set and `dayOfMonth` empty; confirm the preview's next date == the date the spawner produces. Run the finance template-spawn smoke (QA.md §5 — recurring draft spawn) and confirm preview/spawn agree.
3. **Optional follow-up (judgment):** make the client `previewOccurrences` import the server's pure date-math, or extract the shared stepping into one function both call. Trade-off: the client file is explicitly `'use client'`-safe and must not pull in prisma/node:crypto — verify `computeNextOccurrenceDate`'s module has no client-unsafe imports before merging them. If it does, keep two functions but add a **shared unit test** asserting they agree across all frequencies (cheaper than merging, kills the divergence).

### Step 2 — Unify bill/income GL upsert primitives (Finding 1) `[CRITICAL]`
1. **Export** `assertBalanced` and `assertGlAccountsBelongToFamily` from [`finance-posting.ts`](../src/lib/finance-posting.ts#L68) (currently private). Add `upsertDraftJournal({ … , isPosted })` to the same module — one function encapsulating: balance check → GL-family validation → posted-entry guard → atomic delete+recreate/create. `isPosted` is an explicit parameter.
2. Replace the body of [`upsertBillDraftJournal`](../src/app/api/finance/bills/route.ts#L91) with a call passing `isPosted: false`.
3. Replace the body of [`upsertIncomeJournalEntry`](../src/app/api/finance/income/route.ts#L46) with a call passing `isPosted: true` (preserving the current `isBalanced`-which-is-always-true behaviour). **Keep the divergence explicit at the call site.**
4. **Verify (QA.md §5 finance smoke — run BOTH lifecycles, this is the parity gate):**
   - Bill: create → draft JE is `isPosted:false`; approve/invoice → promoted; trial balance balances (DR=CR).
   - Income: create → JE is `isPosted:true`; receipt; trial balance balances.
   - Edit a draft of each (exercises the update branch); confirm posted-entry guard still throws on an attempt to modify a posted JE in place.
   - `npx tsc --noEmit` clean.

### Step 3 — Retire dead `postBillPaymentToGL` (Finding 3) `[High]`
1. Confirm zero callers (`grep -rn postBillPaymentToGL src/`). 
2. Delete the function from [`bills/route.ts:40`](../src/app/api/finance/bills/route.ts#L40) and fix the stale reference in the finance-posting.ts header comment.
3. **Verify:** record a bill payment via the payments route → posts via `postBillPaymentJournal`; trial balance balances (QA.md §5 — bill payment lifecycle). `npx tsc --noEmit` clean.

### Step 4 — Wire (or remove) `postIncomeReceiptJournal` (Finding 4) `[High — DECISION REQUIRED]`
- **Decide first:** route income simple-receipt through the shared helper, or delete the unused helper. This is a behaviour decision, not a mechanical dedupe — surface to the user before acting.
- **Verify (if wiring up):** income simple-receipt posts DR Bank / CR AR; AR ledger and trial balance balance (QA.md §5 — income receipt lifecycle).

### Step 5 — `getFamilyTimezone` + `DEFAULT_TIMEZONE` (Finding 5) `[Medium — DECISION REQUIRED]`
1. **Decide the default** (Sydney vs Brisbane) and whether spawn paths need a separate DST-stable default. Do not silently unify until confirmed.
2. Add `DEFAULT_TIMEZONE` + `getFamilyTimezone(familyId)` to [`src/lib/timezone.ts`](../src/lib/timezone.ts) (or `src/lib/family.ts`).
3. Migrate the ~18 sites listed in Finding 5 to call it. Touch one module group at a time (finance read routes → schedulers → pages).
4. **Verify:** trial balance / P&L / BAS still scope to the correct local FY window (QA.md §5 + §6 accountant checks); spawn smoke (QA.md §10/§5) still spawns on the right local day. `npx tsc --noEmit` clean.

### Step 6 — `formatCurrency` adoption (Finding 7) `[Low — DECISION REQUIRED on Option A/B]`
1. If Option B: extend `formatCurrency(n, options?)` in [`financeShared.ts:149`](../src/lib/financeShared.ts#L149).
2. Replace the ~23 inline `Intl.NumberFormat('en-AU', …)` sites (and the `maximumFractionDigits` variants if Option B).
3. **Verify:** visual spot-check of dashboard card, a finance page, an Excel export, and an email template render identical strings. `npx tsc --noEmit` clean. (No smoke test — display only.)

### Step 7 — AI tools date-string helpers (Finding 6) `[Low]`
1. Replace the 5 inline `toLocaleDateString('en-CA', { timeZone })` sites with `dateStringInTz`/`todayStringInTz`. **Leave [`meal-plan.tool.ts:178`](../src/lib/ai/tools/meal-plan.tool.ts#L178) untouched** (UTC-midnight meal-plan exception).
2. **Verify:** AI digest/birthdays/calendar tools return the same "today" boundary for a UTC+10 family. `npx tsc --noEmit` clean.

---

## Notes / things deliberately NOT flagged

- `applyDayOfMonth` appears in two recurrence files but the copies **agree** — covered by the Step 1 follow-up, not a separate finding.
- `nextNJournalReferences` ([`bills/route.ts:188`](../src/app/api/finance/bills/route.ts#L188)) has **no second copy** — single-use, ignored per scope.
- [`list-helpers.ts` `filterTodoItems`](../src/lib/list-helpers.ts#L105) computes "today" with runtime-local `new Date(y,m,d)` rather than a tz helper. This is a **client-only** helper (lists render client-side) so it is correct there, and it is not duplicated — out of scope for this audit, noted for awareness only.
- The good pattern worth preserving: [`chore-helpers.ts`](../src/lib/chore-helpers.ts) and [`finance-opening-balance.ts` `deriveJournalLineBalances`](../src/lib/finance-opening-balance.ts#L455) are already the consolidated home for logic that used to be inline — the target state for Findings 1–5.
