import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { currentFyYear, fyDateRangeInTz, fyLabel } from '@/lib/finance-fy'
import { localMidnightToUtc, dateStringInTz, DEFAULT_TIMEZONE } from '@/lib/timezone'
import { deriveGlActualTaxFields } from '@/lib/finance-tax-report'

// ── NOTE: Tax bracket calculations have been intentionally moved to the
//    page component (tax-report/page.tsx) so they can be updated each
//    July without touching the API or triggering a redeployment.
//    This route returns raw financial data only.
//
// ── DATA SOURCES (GL-first) ────────────────────────────────────────────────
//
//   glActuals   — posted FinanceJournalLine entries on GL accounts marked
//                 isTaxDeduction=true or taxIncludeInReporting=true.
//                 These are the authoritative figures. They agree with the
//                 Trial Balance, P&L, and Balance Sheet by construction.
//
//   incomeEstimates — FinanceIncomeEntry records marked isTaxTracked=true.
//                 These are PLANNING figures (annualised salary, rental
//                 estimates, etc.) used by the tax bracket calculator in the
//                 page component. They are clearly separated from GL actuals
//                 in the response so the page component can label them correctly.
//
//   taxCategories — FinanceCategory metadata used by the page component to
//                 group and label GL actuals.
//
// The old "transactions" field (from FinanceTransaction) has been replaced by
// "glActuals" (from FinanceJournalLine). The page component must use
// glActuals for all statutory figures.

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)

  const entityId = searchParams.get('entityId') ?? undefined
  const fromRaw  = searchParams.get('from')
  const toRaw    = searchParams.get('to')

  const familyId = user.familyId

  // Load family's financial year start month setting
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { financeYearStartMonth: true, timezone: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7
  const tz = family?.timezone ?? DEFAULT_TIMEZONE

  // Default to current financial year based on family's FY start month
  const fyStartYear = currentFyYear(fyStartMonth)
  const { start: defaultFrom, end: defaultTo } = fyDateRangeInTz(fyStartYear, fyStartMonth, tz)

  // from/to arrive as YYYY-MM-DD calendar dates and must be read in the family
  // timezone, not UTC. The server runs in UTC, so new Date('2025-07-01') is UTC
  // midnight = 10:00 the same day in Sydney (UTC+10): an entry within the offset of
  // the FY boundary would land in the wrong financial year. localMidnightToUtc
  // anchors the day to the family tz; the end bound covers the whole final day.
  const from = fromRaw ? localMidnightToUtc(fromRaw, tz) : defaultFrom
  const to   = toRaw   ? new Date(localMidnightToUtc(toRaw, tz).getTime() + 86_400_000 - 1) : defaultTo

  // ── 1. All family members ──────────────────────────────────────────────
  const members = await prisma.user.findMany({
    where: { familyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  // ── 2. All entities ────────────────────────────────────────────────────
  const entities = await prisma.financeEntity.findMany({
    where: { familyId },
    select: { id: true, name: true, type: true, isDefault: true },
    orderBy: { sortOrder: 'asc' },
  })

  // ── 3. Tax-relevant GL categories ─────────────────────────────────────
  const taxCategories = await prisma.financeCategory.findMany({
    where: {
      familyId,
      hideFromReports: false,
      OR: [{ isTaxDeduction: true }, { taxIncludeInReporting: true }],
    },
    select: {
      id: true, name: true, taxDisplayLabel: true,
      isTaxDeduction: true, taxIncludeInReporting: true, type: true,
    },
  })
  const taxCategoryIds = new Set(taxCategories.map(c => c.id))

  // ── 4. GL ACTUALS — posted journal lines on tax-relevant accounts ──────
  //
  // This replaces the old FinanceTransaction read. Every financial event
  // (bill paid, income received, manual journal) that hits a tax-relevant
  // GL account will appear here, because those events all post to the GL.
  //
  // Income accounts (type='income') with taxIncludeInReporting=true → taxable income
  // Expense/transfer accounts with isTaxDeduction=true              → tax deductions
  // Any account with taxIncludeInReporting=true                     → included in report
  const journalLineWhere: any = {
    journalEntry: {
      familyId,
      isPosted: true,
      date: { gte: from, lte: to },
      ...(entityId ? { entityId } : {}),
    },
    glAccountId: { in: [...taxCategoryIds] },
  }

  const journalLines = await prisma.financeJournalLine.findMany({
    where: journalLineWhere,
    include: {
      glAccount: {
        select: {
          id: true, name: true, type: true,
          taxDisplayLabel: true, isTaxDeduction: true, taxIncludeInReporting: true,
          memberId: true, isTaxPayment: true,
        },
      },
      journalEntry: {
        select: {
          id: true, reference: true, date: true, description: true,
          type: true, entityId: true,
          entity: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { journalEntry: { date: 'desc' } },
  })

  // Build member name map
  const memberMap = new Map(members.map(m => [m.id, m.name]))

  // ── 5. Aggregate GL actuals by GL account ──────────────────────────────
  //
  // For each tax-relevant GL account, sum the net movement of posted
  // journal lines in the period following normal balance rules:
  //   Income accounts:  CR increases, DR decreases  → net = CR - DR
  //   Expense accounts: DR increases, CR decreases  → net = DR - CR
  //
  // We also emit individual line items so the page component can show
  // a drill-down of what contributed to each category's total.

  interface GlActualItem {
    journalEntryId: string
    reference: string
    date: string
    description: string
    entryType: string
    amount: number       // net movement (always positive for normal-side entries)
    side: string         // 'debit' | 'credit'
    glAccountId: string
    glAccountName: string
    glAccountType: string
    taxDisplayLabel: string | null
    isTaxDeduction: boolean
    taxIncludeInReporting: boolean
    memberId: string | null          // account owner — drives per-person attribution
    taxClassification: string | null // 'tax_payment' for PAYG accounts, else null
    entityId: string | null
    entityName: string | null
  }

  const glActuals: GlActualItem[] = journalLines.map(line => {
    const acct = line.glAccount
    const entry = line.journalEntry

    // Net movement: positive means the account balance increased on its normal side
    const isNormalDebitSide = acct.type === 'asset' || acct.type === 'expense'
    const netAmount = isNormalDebitSide
      ? (line.side === 'debit'  ? line.amount : -line.amount)
      : (line.side === 'credit' ? line.amount : -line.amount)

    // Per-person attribution: derive owner + PAYG classification from the GL account.
    const { memberId, taxClassification } = deriveGlActualTaxFields(acct)

    return {
      journalEntryId:        entry.id,
      reference:             entry.reference ?? '',
      date:                  entry.date.toISOString().split('T')[0],
      description:           entry.description,
      entryType:             entry.type,
      amount:                Math.round(netAmount * 100) / 100,
      side:                  line.side,
      glAccountId:           acct.id,
      glAccountName:         acct.name,
      glAccountType:         acct.type,
      taxDisplayLabel:       acct.taxDisplayLabel ?? null,
      isTaxDeduction:        acct.isTaxDeduction,
      taxIncludeInReporting: acct.taxIncludeInReporting,
      memberId,
      taxClassification,
      entityId:              entry.entityId ?? null,
      entityName:            entry.entity?.name ?? null,
    }
  })

  // ── 6. Income estimates (PLANNING DATA — master income streams only) ────
  //
  // Rules that prevent double-counting:
  //
  //   parentIncomeId: null  — root/master entries only. Every time income is
  //       received a child occurrence is spawned. If we included children here
  //       each monthly salary of $8k would appear as 10× $96k = $960k instead
  //       of 1× $96k. The master entry IS the stream definition.
  //
  //   isActive: true        — exclude deactivated streams.
  //
  // These are PLANNING figures (annualised estimate of the stream). They are
  // NOT GL actuals and must be clearly labelled as projections in the UI.
  // The page component uses them for the tax bracket "projected" column only.
  const incomeWhere: any = {
    familyId,
    isActive: true,
    parentIncomeId: null,          // master entries only — excludes spawned children
    OR: [{ isTaxTracked: true }, { taxClassification: { not: null } }],
  }
  if (entityId) incomeWhere.entityId = entityId

  const incomeEstimates = await prisma.financeIncomeEntry.findMany({
    where: incomeWhere,
    include: {
      category: { select: { id: true, name: true, taxDisplayLabel: true } },
      entity:   { select: { id: true, name: true } },
    },
    orderBy: { nextExpectedDate: 'desc' },
  })

  // Frequency → annual multiplier.
  // bimonthly = every 2 months = 6× per year.
  // Entries without a recognised frequency default to yearly (multiplier 1)
  // rather than monthly (12) to fail safe — over-counting income is worse
  // than under-counting it for a planning estimate.
  const freqMultiplier: Record<string, number> = {
    weekly:      52,
    fortnightly: 26,
    monthly:     12,
    bimonthly:   6,   // every 2 months — was missing, caused ×2 inflation
    quarterly:   4,
    halfyearly:  2,
    yearly:      1,
    'one-off':   1,
  }

  const serializedIncomeEstimates = incomeEstimates.map(e => ({
    id:                      e.id,
    name:                    e.name,
    amount:                  e.amount,
    frequency:               e.frequency,
    estimatedAnnual:         e.amount * (freqMultiplier[e.frequency] ?? 1),
    isTaxTracked:            e.isTaxTracked,
    taxRate:                 e.taxRate,
    taxClassification:       e.taxClassification,
    categoryId:              e.categoryId,
    categoryName:            e.category?.name ?? null,
    categoryTaxDisplayLabel: e.category?.taxDisplayLabel ?? null,
    entityId:                e.entityId,
    entityName:              e.entity?.name ?? null,
    memberId:                e.memberId,
    memberName:              e.memberId ? (memberMap.get(e.memberId) ?? null) : null,
  }))

  return NextResponse.json({
    financialYear: fyLabel(fyStartYear, fyStartMonth),
    from: dateStringInTz(from, tz),
    to:   dateStringInTz(to, tz),
    members,
    entities,
    // GL-sourced actuals — use these for all statutory tax figures
    glActuals,
    // Planning estimates — annualised income for tax bracket calculations only
    incomeEstimates: serializedIncomeEstimates,
    // Legacy field alias so existing page component code keeps working
    // while it is migrated to use glActuals. Remove once page is updated.
    transactions: glActuals,
    incomeEntries: serializedIncomeEstimates,
    taxCategories: taxCategories.map(c => ({
      id:                    c.id,
      name:                  c.name,
      type:                  c.type,
      displayLabel:          c.taxDisplayLabel,
      isTaxDeduction:        c.isTaxDeduction,
      taxIncludeInReporting: c.taxIncludeInReporting,
    })),
    source: 'gl',  // confirms this response is GL-sourced — useful for debugging
  })
}
