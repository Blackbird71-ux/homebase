# Homebase — Finance Reports: Export, Print & Scheduled Monthly Email
## AI Agent Implementation Specification — **Revised after Tax Reporting design**

> **Stack:** Next.js 16 App Router · SQLite via Prisma 7 · better-sqlite3 · Tailwind + shadcn/ui · sonner toasts  
> **Build:** Windows dev (`C:\Appdev\HomeBase`) → Docker multi-stage → Synology NAS  
> **Docker:** `docker-compose.yml` + `docker/entrypoint.sh` (already has `prisma migrate deploy` — do NOT duplicate it)  
> **Scheduler:** `node-cron` ^4 and `nodemailer` ^7 are **already in `package.json`** — do NOT reinstall  
> **Excel:** `xlsx` ^0.18.5 is **already in `package.json`** — use it; do NOT add `exceljs`  
> **Auth pattern:** `requireSession()` from `@/lib/auth-helpers` — match every existing API route  
> **Error pattern:** `toast.error()` from `sonner`, HTTP errors returned as `{ error: '...' }` JSON  

---

## 0. Pre-flight: Agent Must Do First

```bash
# 1. Confirm no pending migrations before adding new ones
npx prisma migrate status

# 2. Confirm xlsx is available (it is — in package.json)
grep '"xlsx"' package.json

# 3. Confirm node-cron and nodemailer are available (they are)
grep '"node-cron"\|"nodemailer"' package.json

# 4. Note the scheduler cron already runs at 03:00 for DB backups in entrypoint.sh
# The monthly report email must be a separate in-process cron, not an entrypoint cron

# 5. The existing finance layout nav is at src/app/(app)/finance/layout.tsx
# It already has: Overview, Accounts, Transactions, Bills, Income, Budget,
# Goals, Reports, P&L, Vendors, Entities, Members, Locations, Categories
# The Tax Report spec will add "Tax Report" — add "Reports" export/print
# controls INSIDE the existing finance/reports page, not as a new nav tab
```

---

## 1. What Changed vs the Previous Spec — Summary

| Previous spec said | Reality found in codebase | What the agent should do instead |
|---|---|---|
| "Install `exceljs`" | `xlsx` 0.18.5 already in package.json | Use `xlsx` (SheetJS) — no new install |
| "Install `node-cron`" | Already in package.json v4.2.1 | No install needed |
| "Install `nodemailer`" | Already in package.json v7.0.13 | No install needed |
| "Add `migrate deploy` to entrypoint" | Already a full production-grade entrypoint at `docker/entrypoint.sh` — do NOT touch | No change needed |
| "Add `TZ=Australia/Brisbane` to docker-compose" | Not present — add to docker-compose.yml env section | Add TZ env var only |
| "Create a new nav tab for Tax Report" | Tax Report is a separate spec (HOMEBASE_TAX_REPORTING_SPEC.md); the layout already has many tabs | Tax Report page is covered by the tax spec. This spec adds export/print controls to the EXISTING `/finance/reports` page and a new `/finance/tax-report` export endpoint |
| "New `FinanceSnapshot` and `ReportEmail` Prisma models" | Still needed — not yet in schema | Create migration `20260518000000_add_finance_snapshot` |
| "Report JSON payload" | Now must also include tax classification data once the tax spec is implemented | See §3 — extend payload shape |
| "`exceljs` sheet builder" | Use `xlsx` (SheetJS) instead — different API | See §6 for corrected implementation |

---

## 2. Architecture — What This Spec Builds

```
Existing finance/reports page  →  add Export Excel / Print / Email Now buttons
Existing finance/tax-report page (from tax spec)  →  add Export / Print buttons there too

New API routes:
  GET  /api/finance/export/excel?mode=budget|tax&year=2026-27   → xlsx download
  GET  /api/finance/export/print?mode=budget|tax&year=2026-27   → self-contained HTML
  POST /api/finance/email/send                                   → manual trigger
  GET  /api/finance/snapshots                                    → list saved snapshots
  GET  /api/finance/snapshots/[id]                               → load one snapshot

New Prisma models:
  FinanceSnapshot  — one row per monthly automated save
  ReportEmail      — send log

In-process monthly scheduler (node-cron):
  Fires 1st of month 00:05 AEST → saves snapshot → emails recipients
```

---

## 3. Database — New Prisma Models

### 3.1 Add to `prisma/schema.prisma`

Append after the `FinanceEntity` model (end of file):

```prisma
model FinanceSnapshot {
  id             String        @id @default(cuid())
  financialYear  String        // "2026-27"
  snapshotMonth  Int           // calendar month snapshot was taken (1-12)
  snapshotYear   Int           // calendar year snapshot was taken
  periodLabel    String        // "Jul 2026 – Jan 2027"
  monthsComplete Int           @default(0)
  reportJson     String        // JSON stringified — SQLite has no Json column type
  createdAt      DateTime      @default(now())
  emails         ReportEmail[]

  familyId       String
  family         Family        @relation(fields: [familyId], references: [id], onDelete: Cascade)

  @@unique([familyId, financialYear, snapshotMonth, snapshotYear])
  @@index([familyId, financialYear])
  @@map("finance_snapshots")
}

model ReportEmail {
  id             String          @id @default(cuid())
  snapshotId     String
  snapshot       FinanceSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  recipientEmail String
  subject        String
  status         String          @default("pending") // pending | sent | failed
  errorMessage   String?
  sentAt         DateTime?
  createdAt      DateTime        @default(now())

  @@index([snapshotId])
  @@map("report_emails")
}
```

**Also add the reverse relation on `Family`:**
```prisma
// Inside the Family model, alongside other finance relations:
financeSnapshots   FinanceSnapshot[]
```

### 3.2 New migration

**Create file:** `prisma/migrations/20260518000000_add_finance_snapshot/migration.sql`

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

> After creating both files, run `npx prisma generate` on Windows dev.  
> The migration applies automatically on the NAS at next deploy via `docker/entrypoint.sh`.

---

## 4. Report JSON Payload Shape

Stored in `FinanceSnapshot.reportJson` (stringified). Covers both budget/cashflow and tax so a single snapshot is useful for both report types.

```typescript
interface ReportPayload {
  meta: {
    financialYear: string        // "2026-27"
    generatedAt: string          // ISO timestamp
    periodLabel: string          // "Jul 2026 – Jan 2027"
    monthsComplete: number       // 7
    months: string[]             // ["Jul","Aug","Sep","Oct","Nov","Dec","Jan"]
  }

  // ── Budget / cashflow (mirrors 2027_BUDGET.xlsx) ──────────────────────────
  sections: Array<{
    name: string                 // "PERSONAL" | "SUPER" | "UNITRAK" | "HOPEVALE"
    entityId: string | null
    income: {
      rows: Array<{ label: string; monthly: number[]; total: number }>
      subtotal: number
    }
    expenses: {
      categories: Array<{
        name: string
        rows: Array<{ label: string; monthly: number[]; total: number }>
        subtotal: number
      }>
      subtotal: number
    }
    nett: number
  }>
  totals: {
    totalIncome: number
    totalExpenses: number
    totalNett: number
  }

  // ── Tax summary (populated once tax spec fields exist) ────────────────────
  tax: {
    byMember: Array<{
      memberId: string
      memberName: string           // "Mark" | "Michelle"
      taxableIncome: number
      deductions: number
      totalTaxable: number
      paygWithheld: number
      taxPayments: number          // PAYG installments
      taxCreditForDivs: number
      estimatedTaxPayable: number
      estimatedRefundOrOwing: number  // negative = refund
      sgcEmployer: number
      superContributionsVoluntary: number
      superCapUsed: number
      superCapLimit: number
    }>
    joint: {
      bankInterest: number
      otherJointIncome: number
      total: number
    }
    byEntity: Array<{
      entityId: string
      entityName: string
      income: number
      expenses: number
      taxableIncome: number
      estimatedTax: number
    }>
  } | null  // null until taxClassification data has been entered
}
```

---

## 5. API Routes

All routes in `src/app/api/finance/`. Follow existing patterns: `requireSession()`, try/catch, error JSON `{ error: '...' }`.

### 5.1 `GET /api/finance/export/excel`

**File:** `src/app/api/finance/export/excel/route.ts`

Query params: `mode` (budget|tax, default budget), `year` (e.g. 2026-27), `snapshotId` (optional).

Use `xlsx` (SheetJS — already installed):
```typescript
import * as XLSX from 'xlsx'

const wb = XLSX.utils.book_new()
// build sheets...
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
return new Response(buf, {
  headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="Homebase_Finance_${dateStr}.xlsx"`,
  },
})
```

**Sheet layout (match `2027_BUDGET.xlsx` exactly):**
- Row 1: year label + month headers (Jul → current month) + Total
- Section headers bold, grey fill `#D9D9D9`
- Category subtotal rows italic, blue tint `#DEEAF1`
- Section total rows bold, light grey `#F2F2F2`
- Grand total row bold, mid-blue `#BDD7EE`
- Currency format: `$#,##0.00;($#,##0.00);"-"`
- NETT sheet: positive dark green `#375623`, negative dark red `#C00000`
- Column A width 24, month cols 10, total col 14
- Freeze panes row 1 + col A on every sheet

**When `mode=tax`:** add a fourth sheet — TAX SUMMARY matching `Tax_Calculator.xlsx`:
- Mark on left columns, Michelle on right columns (side-by-side)
- Rows: Wages, Bank Interest, Other Income, Total Income, Super Contributions (with SGC alongside), Other Deductions, Total Deductions, Total Taxable, Per Week, Tax Payable, PAYG Withheld, PAYG Installments, Tax Credit for Divs, **NET REFUND / (OWING)**
- Amber fill on refund row if positive, red fill if owing
- Disclaimer row: "Estimated only — based on ATO tax brackets. Consult your accountant."

### 5.2 `GET /api/finance/export/print`

**File:** `src/app/api/finance/export/print/route.ts`

Returns fully self-contained `text/html`. No external CSS or JS.

- `@media print`: hide floating Print button, enforce `break-before: page` per section
- A4 portrait, 15mm margins, CSS page-number counter
- Sections: Income, Expenses, NETT — each starts a new page
- When `mode=tax`: fourth section — Tax Summary (Mark/Michelle side-by-side)
- Floating `<button onclick="window.print()">Print</button>` visible on screen only
- Footer: "Homebase Family Finance — Confidential"

### 5.3 `POST /api/finance/email/send`

**File:** `src/app/api/finance/email/send/route.ts`

Body: `{ year, snapshotId?, recipients, note? }`  
Response: `{ ok: true, emailId: string }` or `{ error: string }`

### 5.4 `GET /api/finance/snapshots`

**File:** `src/app/api/finance/snapshots/route.ts`

Query: `?year=2026-27` (optional filter)  
Returns array without `reportJson` (too large for a list).

### 5.5 `GET /api/finance/snapshots/[id]`

**File:** `src/app/api/finance/snapshots/[id]/route.ts`

Returns full snapshot including parsed `reportJson`.

---

## 6. Report Data Service

**File:** `src/lib/financeReport.ts`

```typescript
export async function buildYtdReport(
  familyId: string,
  year: string
): Promise<ReportPayload>
```

Called by the excel route, print route, email service, and scheduler. Queries:
- `FinanceIncomeEntry.findMany` where `nextExpectedDate` in FY range, grouped by entity
- `FinanceRecurringBill.findMany` where `nextDueDate` in FY range, grouped by entity + category
- `FinanceTransaction.findMany` where `date` in FY range (cash basis figures)
- Tax data: only if `taxClassification` fields exist (from tax spec migration)

```typescript
function fyDateRange(fy: string): { start: Date; end: Date } {
  const startYear = parseInt(fy.split('-')[0])
  return {
    start: new Date(`${startYear}-07-01T00:00:00.000Z`),
    end:   new Date(`${startYear + 1}-06-30T23:59:59.999Z`),
  }
}

function getCurrentFY(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 6
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`
}
```

---

## 7. Scheduler

**File:** `src/lib/reportScheduler.ts`

```typescript
import cron from 'node-cron'

export function startReportScheduler() {
  // 1st of month, 00:05 AEST. TZ env var on container handles offset.
  cron.schedule('5 0 1 * *', async () => {
    // build report → save FinanceSnapshot → email recipients
  }, { timezone: 'Australia/Brisbane' })
}
```

**Register in `src/instrumentation.ts`** (file already exists — ADD to it, don't replace):

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startReportScheduler } = await import('./lib/reportScheduler')
    startReportScheduler()
  }
}
```

---

## 8. Email Service

**File:** `src/lib/emailReportService.ts`

Use `nodemailer` (already installed). SMTP config from env vars.

Email body: summary table (entity rows — Income / Expenses / Nett). If tax data present in snapshot, append the Mark/Michelle tax summary table. Attach `.xlsx` as Buffer.

Subject: `Homebase Finance — YTD {periodLabel} ({financialYear})`

---

## 9. Frontend Changes

### 9.1 Reports page — action bar

**File:** `src/app/(app)/finance/reports/page.tsx` — add below existing period selector:

```tsx
import { Download, Printer, Mail } from 'lucide-react'

// Export Excel
<button onClick={() => window.location.href = `/api/finance/export/excel?year=${currentFY}`}>
  <Download className="h-4 w-4" /> Export Excel
</button>

// Print
<button onClick={() => window.open(`/api/finance/export/print?year=${currentFY}`, '_blank')}>
  <Printer className="h-4 w-4" /> Print
</button>

// Email
<button onClick={() => setShowEmailModal(true)}>
  <Mail className="h-4 w-4" /> Email Report
</button>
```

### 9.2 Tax Report page — action bar

Add to `src/app/(app)/finance/tax-report/page.tsx` (created by tax spec) — same buttons but with `mode=tax`:
```typescript
`/api/finance/export/excel?mode=tax&year=${currentFY}`
`/api/finance/export/print?mode=tax&year=${currentFY}`
```

### 9.3 Email modal

**File:** `src/components/finance/EmailReportModal.tsx`

Use existing `Dialog` from `@/components/ui/dialog`. Fields: recipients (pre-filled from env, editable), optional note textarea. On submit: `POST /api/finance/email/send`. Toast success/error.

### 9.4 Snapshot history panel

Add to Reports page — collapsible section showing past snapshots by FY. "View" loads snapshot via `GET /api/finance/snapshots/[id]`. "Download Excel" hits export route with `snapshotId`.

---

## 10. docker-compose.yml Changes (only)

Add to the `homebase-app` service `environment` block — do NOT touch anything else:

```yaml
- TZ=Australia/Brisbane
- SMTP_HOST=${SMTP_HOST}
- SMTP_PORT=${SMTP_PORT}
- SMTP_USER=${SMTP_USER}
- SMTP_PASS=${SMTP_PASS}
- SMTP_FROM=${SMTP_FROM}
- REPORT_EMAIL_RECIPIENTS=${REPORT_EMAIL_RECIPIENTS}
```

Add matching vars to `.env.local` (dev) and `.env.example`. After updating, copy `docker-compose.yml` to the NAS before next deploy.

**Do NOT modify `docker/entrypoint.sh`** — it already has `prisma migrate deploy` and is production-grade.

---

## 11. File Change Summary

### New files
```
prisma/migrations/20260518000000_add_finance_snapshot/migration.sql
src/lib/financeReport.ts
src/lib/emailReportService.ts
src/lib/reportScheduler.ts
src/app/api/finance/export/excel/route.ts
src/app/api/finance/export/print/route.ts
src/app/api/finance/email/send/route.ts
src/app/api/finance/snapshots/route.ts
src/app/api/finance/snapshots/[id]/route.ts
src/components/finance/EmailReportModal.tsx
```

### Existing files to modify
```
prisma/schema.prisma              — add FinanceSnapshot, ReportEmail, Family relation
src/instrumentation.ts            — ADD scheduler registration (don't replace existing content)
src/app/(app)/finance/reports/page.tsx   — add action bar + snapshot history
src/app/(app)/finance/tax-report/page.tsx — add mode=tax export/print buttons (tax spec creates this)
docker-compose.yml                — add TZ + SMTP env vars
.env.local + .env.example         — add SMTP_* + REPORT_EMAIL_RECIPIENTS
```

### Files to NOT touch
```
docker/entrypoint.sh   — already correct
package.json           — all required packages already present
```

---

## 12. Implementation Order

1. Schema changes + migration SQL
2. `npx prisma generate`
3. `src/lib/financeReport.ts` — test with a quick `node -e` script
4. Excel export route — verify download in browser
5. Print export route — verify in new tab + Ctrl+P preview
6. Email service + send route — test with real SMTP
7. Scheduler + `instrumentation.ts` — test with `* * * * *`, then restore
8. Snapshot list + get routes
9. Frontend: action bar on Reports page + EmailReportModal + snapshot history
10. Frontend: action bar on Tax Report page (if tax spec already done)
11. `docker-compose.yml` + `.env` updates → copy to NAS
12. Docker build + NAS deploy → verify migration in startup logs

---

## 13. Testing Checklist

- [ ] `npx prisma migrate status` clean before and after
- [ ] Excel download: 3 sheets budget mode, 4 sheets tax mode
- [ ] Excel: section headers, subtotals, currency format, freeze panes all correct
- [ ] Print: page breaks, print-only styles, floating button hidden in print
- [ ] Manual email: arrives, correct subject, xlsx attached, ReportEmail row created
- [ ] Scheduler (test with `* * * * *`): snapshot created, email received
- [ ] Snapshot history: list, view, download all work
- [ ] Existing Reports page: no regressions
- [ ] Finance nav tabs: all still work
- [ ] NAS deploy: migration applied cleanly per startup logs
