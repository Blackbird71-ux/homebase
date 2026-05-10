# Finance Reports — Export, Print & Scheduled Monthly Email: Implementation Plan

> Based on [`HOMEBASE_FINANCE_REPORTS_SPEC.md`](https://github.com/user-attachments/files/19556023/HOMEBASE_FINANCE_REPORTS_SPEC.md)  
> Stack: Next.js 16 App Router · SQLite via Prisma 7 · Tailwind + shadcn/ui · sonner toasts  
> Pre-installed: `xlsx` 0.18.5 · `node-cron` 4.2.1 · `nodemailer` 7.0.13 — **no new npm packages needed**

---

## 1. Current State Analysis

| Area | Current State | What Needs to Change |
|---|---|---|
| **Prisma Schema** | [`prisma/schema.prisma`](prisma/schema.prisma) — ✅ `FinanceSnapshot` and `ReportEmail` models appended after `FinanceEntity`. `financeSnapshots` relation added to `Family`. |
| **Migration** | `prisma/migrations/20260518000000_add_finance_snapshot/migration.sql` — ✅ DDL for both tables + indexes created. |
| **Email Utility** | [`src/lib/emailReportService.ts`](src/lib/emailReportService.ts) — ✅ Reads SMTP from env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Attaches `.xlsx` buffer. |
| **Scheduler** | [`src/lib/reportScheduler.ts`](src/lib/reportScheduler.ts) — ✅ Singleton pattern with global flag. Cron: `5 0 1 * *` (1st of month, 00:05 Aus/Brisbane). |
| **Instrumentation** | [`src/instrumentation.ts`](src/instrumentation.ts) — ✅ `startReportScheduler` imported and called alongside existing `initScheduler`. |
| **Report Data Service** | [`src/lib/financeReport.ts`](src/lib/financeReport.ts) — ✅ `buildYtdReport(familyId, year)` queries income entries, recurring bills, transactions, tax data. |
| **Excel Export** | [`src/app/api/finance/export/excel/route.ts`](src/app/api/finance/export/excel/route.ts) — ✅ SheetJS with Income, Expenses, NETT sheets + optional Tax Summary. |
| **Print Export** | [`src/app/api/finance/export/print/route.ts`](src/app/api/finance/export/print/route.ts) — ✅ Self-contained HTML with `@media print` styles. |
| **Email Send** | Does not exist. | Create **new** route at [`src/app/api/finance/email/send/route.ts`](src/app/api/finance/email/send/route.ts) — accepts `{ year, snapshotId?, recipients, note? }`. |
| **Snapshots API** | Does not exist. | Create **new** routes at [`src/app/api/finance/snapshots/route.ts`](src/app/api/finance/snapshots/route.ts) (list) and [`src/app/api/finance/snapshots/[id]/route.ts`](src/app/api/finance/snapshots/\[id\]/route.ts) (get one). |
| **Reports Page** | [`src/app/(app)/finance/reports/page.tsx`](src/app/(app)/finance/reports/page.tsx) — 388 lines. Has period selectors (month/quarter/year), category/vendor view toggle, cash/forecast data mode, drill-down. No export/print/email controls. | Add action bar (Export Excel, Print, Email buttons) below period selector. Add collapsible snapshot history panel. Import `useState` for `showEmailModal`. |
| **Tax Report Page** | [`src/app/(app)/finance/tax-report/page.tsx`](src/app/(app)/finance/tax-report/page.tsx) — 368 lines. Fully functional with classification breakdowns, entity filters, super cap indicator. | Add Export Excel and Print buttons using `mode=tax` query param. |
| **Email Modal Component** | Does not exist. | Create **new** [`src/components/finance/EmailReportModal.tsx`](src/components/finance/EmailReportModal.tsx) — Dialog with recipients input, optional note textarea. Calls `POST /api/finance/email/send`. |
| **docker-compose.yml** | [`docker-compose.yml`](docker-compose.yml) — 60 lines. Has env vars for `NODE_ENV`, `DATABASE_URL`, `AUTH_URL`, `NEXTAUTH_URL`. No TZ or SMTP vars. | Add `TZ=Australia/Brisbane`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `REPORT_EMAIL_RECIPIENTS` to `homebase-app.environment`. |
| **env.local.example** | [`env.local.example`](env.local.example) — 33 lines. No SMTP or report email vars. | Add `SMTP_*` and `REPORT_EMAIL_RECIPIENTS` variables. |

---

## 2. Key Design Decisions (Deviation from Spec)

### 2.1 SMTP Configuration Strategy

The spec says to use only env vars for SMTP. However [`src/lib/email.ts`](src/lib/email.ts) already reads SMTP from the admin user's DB-stored `uiPreferences` (set via Settings UI).

**Decision:** Create [`src/lib/emailReportService.ts`](src/lib/emailReportService.ts) with a **dual approach**:
- **Automated/scheduled emails** (`sendReportEmail()`): Read SMTP from env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). This is required for the scheduler to work without a logged-in session.
- **Manual emails from UI** (`POST /api/finance/email/send`): Use the existing `sendEmail()` from [`src/lib/email.ts`](src/lib/email.ts) which reads from DB config. The user must have SMTP configured in Settings first.

This way:
- The scheduler works autonomously (env vars are available at container start)
- Manual sends continue to use the existing Settings-configured SMTP
- No breaking changes to the existing `sendEmail()` function

### 2.2 Scheduler Registration

The spec says to replace `src/instrumentation.ts` entirely. However it already registers the reminder scheduler.

**Decision:** Follow the spec's instruction to **add to** (not replace) [`src/instrumentation.ts`](src/instrumentation.ts):

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('@/lib/scheduler')
    initScheduler()
    
    const { startReportScheduler } = await import('@/lib/reportScheduler')
    startReportScheduler()
  }
}
```

### 2.3 Tax Report Page Integration

The spec references the tax report page as if it needs to be created. It **already exists** at [`src/app/(app)/finance/tax-report/page.tsx`](src/app/(app)/finance/tax-report/page.tsx) (368 lines) with full classification breakdowns, entity filtering, and super cap indicators.

**Decision:** Only add Export Excel and Print buttons with `mode=tax` to the existing page. No structural changes needed.

### 2.4 Reports Page — No New Nav Tab

The spec explicitly states: add controls **inside** the existing [`src/app/(app)/finance/reports/page.tsx`](src/app/(app)/finance/reports/page.tsx), not as a new nav tab. The [`src/app/(app)/finance/layout.tsx`](src/app/(app)/finance/layout.tsx) already has 15 tabs — **no changes** to layout.

---

## 3. Implementation Phases

### Phase 1: Schema & Infrastructure (Steps 1–3)

| Step | File | Action | Details |
|------|------|--------|---------|
| 1a | [`prisma/schema.prisma`](prisma/schema.prisma) | Modify | Add `financeSnapshots FinanceSnapshot[]` to Family model (line 47). Append `FinanceSnapshot` and `ReportEmail` model definitions after `FinanceEntity` (after line 900). |
| 1b | [`prisma/migrations/20260518000000_add_finance_snapshot/migration.sql`](prisma/migrations/20260518000000_add_finance_snapshot/migration.sql) | Create | DDL for `finance_snapshots` and `report_emails` tables with indexes, unique constraints, foreign keys. |
| 2 | — | Run command | `npx prisma generate` to regenerate Prisma client. |
| 3 | [`src/lib/financeReport.ts`](src/lib/financeReport.ts) | Create | `buildYtdReport(familyId, year)` — queries income entries, recurring bills, transactions across FY date range. Builds `ReportPayload` with sections per entity, totals, and tax summary (if tax fields exist). Includes `fyDateRange()` and `getCurrentFY()` helpers. |

### Phase 2: API Routes (Steps 4–8)

| Step | File | Action | Details |
|------|------|--------|---------|
| 4 | [`src/app/api/finance/export/excel/route.ts`](src/app/api/finance/export/excel/route.ts) | Create | `GET` handler. Query: `mode`, `year`, `snapshotId`. Uses `xlsx` (SheetJS) to build workbook. Sheets: Income, Expenses, NETT (+ Tax Summary when `mode=tax`). Applies formatting: bold headers, grey fills, currency format, freeze panes, column widths. Returns buffer with `Content-Disposition: attachment`. |
| 5 | [`src/app/api/finance/export/print/route.ts`](src/app/api/finance/export/print/route.ts) | Create | `GET` handler. Returns self-contained HTML with `@media print` styles, `page-break-before` per section, floating Print button visible on screen only, A4 portrait with 15mm margins, page number counter, "Homebase Family Finance — Confidential" footer. |
| 6a | [`src/lib/emailReportService.ts`](src/lib/emailReportService.ts) | Create | `sendReportEmail()` function. Reads SMTP from env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Builds HTML email body (summary table + optional tax table). Attaches `.xlsx` buffer. Subject: "Homebase Finance — YTD {periodLabel} ({financialYear})". |
| 6b | [`src/app/api/finance/email/send/route.ts`](src/app/api/finance/email/send/route.ts) | Create | `POST` handler. Validates body `{ year, snapshotId?, recipients, note? }`. Creates `FinanceSnapshot` if `snapshotId` not provided. Creates `ReportEmail` rows. Uses existing `sendEmail()` from [`src/lib/email.ts`](src/lib/email.ts) for manual sends. Returns `{ ok: true, emailId }`. |
| 7 | [`src/lib/reportScheduler.ts`](src/lib/reportScheduler.ts) | Create | Singleton pattern with global `__reportSchedulerInitialized` flag. Cron: `5 0 1 * *` with `timezone: 'Australia/Brisbane'`. On fire: builds report via `buildYtdReport()`, saves `FinanceSnapshot`, emails recipients from `REPORT_EMAIL_RECIPIENTS` env var. |
| 7b | [`src/instrumentation.ts`](src/instrumentation.ts) | Modify | **Add** import and call of `startReportScheduler` alongside existing `initScheduler`. |
| 8a | [`src/app/api/finance/snapshots/route.ts`](src/app/api/finance/snapshots/route.ts) | Create | `GET` handler. Query: `?year=2026-27` (optional filter). Returns snapshot list without `reportJson` (too large). |
| 8b | [`src/app/api/finance/snapshots/[id]/route.ts`](src/app/api/finance/snapshots/\[id\]/route.ts) | Create | `GET` handler. Returns full snapshot with parsed `reportJson`. |

### Phase 3: Frontend (Steps 9–10)

| Step | File | Action | Details |
|------|------|--------|---------|
| 9a | [`src/app/(app)/finance/reports/page.tsx`](src/app/(app)/finance/reports/page.tsx) | Modify | Add action bar below period selector with: Export Excel (`Download` icon → `window.location.href`), Print (`Printer` icon → `window.open`), Email Report (`Mail` icon → `setShowEmailModal(true)`). Add `useState` for `showEmailModal`. |
| 9b | [`src/components/finance/EmailReportModal.tsx`](src/components/finance/EmailReportModal.tsx) | Create | Dialog with recipients (pre-filled from env), optional note textarea, Send button. Calls `POST /api/finance/email/send`. Toast on success/error. |
| 9c | [`src/app/(app)/finance/reports/page.tsx`](src/app/(app)/finance/reports/page.tsx) | Modify | Add collapsible snapshot history panel. Fetches from `GET /api/finance/snapshots`. "View" loads snapshot, "Download Excel" hits export with `snapshotId`. |
| 10 | [`src/app/(app)/finance/tax-report/page.tsx`](src/app/(app)/finance/tax-report/page.tsx) | Modify | Add Export Excel and Print buttons with `mode=tax` query param. |

### Phase 4: Configuration (Step 11)

| Step | File | Action | Details |
|------|------|--------|---------|
| 11a | [`docker-compose.yml`](docker-compose.yml) | Modify | Add `TZ=Australia/Brisbane`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `REPORT_EMAIL_RECIPIENTS` to `homebase-app.environment` block (after line 30). |
| 11b | [`env.local.example`](env.local.example) | Modify | Add SMTP env vars with comments explaining each. |

---

## 4. File Summary

### 10 New Files

| # | File | Purpose |
|---|------|---------|
| 1 | `prisma/migrations/20260518000000_add_finance_snapshot/migration.sql` | DDL for new tables |
| 2 | `src/lib/financeReport.ts` | Report data aggregation service |
| 3 | `src/lib/emailReportService.ts` | Email sending with env var SMTP + xlsx attachment |
| 4 | `src/lib/reportScheduler.ts` | Monthly cron scheduler (singleton pattern) |
| 5 | `src/app/api/finance/export/excel/route.ts` | Excel download endpoint |
| 6 | `src/app/api/finance/export/print/route.ts` | Print HTML endpoint |
| 7 | `src/app/api/finance/email/send/route.ts` | Manual email trigger endpoint |
| 8 | `src/app/api/finance/snapshots/route.ts` | List snapshots endpoint |
| 9 | `src/app/api/finance/snapshots/[id]/route.ts` | Get single snapshot endpoint |
| 10 | `src/components/finance/EmailReportModal.tsx` | Email dialog component |

### 6 Existing Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `prisma/schema.prisma` | Add `FinanceSnapshot` + `ReportEmail` models + Family relation |
| 2 | `src/instrumentation.ts` | Add `startReportScheduler` import and call |
| 3 | `src/app/(app)/finance/reports/page.tsx` | Add action bar + snapshot history + email modal state |
| 4 | `src/app/(app)/finance/tax-report/page.tsx` | Add export/print buttons with `mode=tax` |
| 5 | `docker-compose.yml` | Add TZ + SMTP env vars |
| 6 | `env.local.example` | Add SMTP env vars documentation |

### Files to NOT Touch

| File | Reason |
|------|--------|
| `docker/entrypoint.sh` | Already production-grade with `prisma migrate deploy` |
| `package.json` | All required packages (`xlsx`, `node-cron`, `nodemailer`) already present |
| `src/lib/email.ts` | Keep existing DB-based SMTP function unchanged; new `emailReportService.ts` handles env var path |
| `src/lib/scheduler.ts` | Keep existing reminder scheduler unchanged |
| `src/app/(app)/finance/layout.tsx` | No new nav tabs needed |

---

## 5. Migration SQL

New migration file at `prisma/migrations/20260518000000_add_finance_snapshot/migration.sql`:

```sql
-- FinanceSnapshot: stores monthly YTD report payloads
CREATE TABLE "finance_snapshots" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "financialYear"  TEXT     NOT NULL,
    "snapshotMonth"  INTEGER  NOT NULL,
    "snapshotYear"   INTEGER  NOT NULL,
    "periodLabel"    TEXT     NOT NULL,
    "monthsComplete" INTEGER  NOT NULL DEFAULT 0,
    "reportJson"     TEXT     NOT NULL,
    "familyId"       TEXT     NOT NULL,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_snapshots_familyId_fkey"
        FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "finance_snapshots_family_fy_month_year_key"
    ON "finance_snapshots"("familyId", "financialYear", "snapshotMonth", "snapshotYear");
CREATE INDEX "finance_snapshots_familyId_financialYear_idx"
    ON "finance_snapshots"("familyId", "financialYear");

-- ReportEmail: log of emails sent for each snapshot
CREATE TABLE "report_emails" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "snapshotId"     TEXT     NOT NULL,
    "recipientEmail" TEXT     NOT NULL,
    "subject"        TEXT     NOT NULL,
    "status"         TEXT     NOT NULL DEFAULT 'pending',
    "errorMessage"   TEXT,
    "sentAt"         DATETIME,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_emails_snapshotId_fkey"
        FOREIGN KEY ("snapshotId") REFERENCES "finance_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "report_emails_snapshotId_idx" ON "report_emails"("snapshotId");
```

---

## 6. API Route Patterns

All API routes follow the established pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const familyId = session.user.familyId
    const { searchParams } = new URL(req.url)
    const year = searchParams.get('year') ?? getCurrentFY()

    // ... handler logic ...

    return NextResponse.json(result)
  } catch (err) {
    console.error('[export/excel]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

## 7. Implementation Order

```
Step 1  →  Schema (prisma/schema.prisma + migration SQL)
Step 2  →  npx prisma generate
Step 3  →  Report data service (src/lib/financeReport.ts)
Step 4  →  Excel export route (src/app/api/finance/export/excel/route.ts)
Step 5  →  Print export route (src/app/api/finance/export/print/route.ts)
Step 6  →  Email service + send route (src/lib/emailReportService.ts + api route)
Step 7  →  Scheduler + instrumentation.ts update
Step 8  →  Snapshot list + detail routes
Step 9  →  Frontend: action bar + EmailReportModal + snapshot history on Reports page
Step 10 →  Frontend: export/print buttons on Tax Report page
Step 11 →  docker-compose.yml + env.local.example updates
```

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Migration conflict**: Another migration may have been added since the spec target date (`20260518`) | Use `npx prisma migrate status` first. If conflict exists, renumber migration timestamp. |
| **xlsx (SheetJS) API differs from spec's exceljs examples** | The spec was written for `exceljs`. The code mode agent must adapt to `xlsx` API: `XLSX.utils.aoa_to_sheet`, `XLSX.utils.book_new`, `XLSX.write` with `{ type: 'buffer' }`. Use `!rows[0][0].v` pattern for cell value assignment. |
| **Tax data may not exist yet** | `buildYtdReport()` must handle missing `taxClassification` fields gracefully — return `tax: null` if no tax data. The Excel and Print routes should conditionally add the Tax sheet/section only when tax data is present. |
| **SMTP env vars not configured** | Report scheduler should log a warning and skip sending if SMTP env vars are missing, rather than crashing. The manual email route will still work via DB-stored SMTP config. |
| **Large report payload in SQLite** | `reportJson` is TEXT (stringified JSON). SQLite handles this fine for single-family use. The list endpoint excludes `reportJson` to keep responses light. |
| **Cron fires during deploy/window** | The scheduler checks `__reportSchedulerInitialized` global flag — only one instance runs. On first deploy, the cron will fire at next scheduled time. |

---

## 9. Testing Checklist

- [ ] `npx prisma migrate status` clean before and after migration
- [ ] `npx prisma generate` completes without errors
- [ ] Excel download: 3 sheets in budget mode (Income, Expenses, NETT), 4 sheets in tax mode (+ TAX SUMMARY)
- [ ] Excel: section headers bold, subtotals italic, currency format `$#,##0.00`, freeze panes on every sheet
- [ ] Print HTML: A4 portrait, `@media print` hides floating button, `page-break-before` works, footer visible
- [ ] Manual email via UI modal: arrives in inbox, correct subject, xlsx attachment, `ReportEmail` row created
- [ ] Scheduler (test with `* * * * *`): `FinanceSnapshot` created, email sent, `ReportEmail` status = `sent`
- [ ] Snapshot history: list loads without `reportJson`, "View" loads full snapshot, "Download Excel" works
- [ ] Existing Reports page: period selector, category/vendor toggle, drill-down all still work
- [ ] Existing Tax Report page: classification breakdowns, entity filter all still work
- [ ] Finance nav tabs: all 15 tabs still render correctly
- [ ] NAS deploy: migration applied cleanly per startup logs
