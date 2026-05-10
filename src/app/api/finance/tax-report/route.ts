import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { currentFyYear, fyDateRange, fyLabel } from '@/lib/finance-fy'

// ── NOTE: Tax bracket calculations have been intentionally moved to the
//    page component (tax-report/page.tsx) so they can be updated each
//    July without touching the API or triggering a redeployment.
//    This route returns raw financial data only.

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const entityId = searchParams.get('entityId') ?? undefined
  const fromRaw  = searchParams.get('from')
  const toRaw    = searchParams.get('to')

  const familyId = session.familyId

  // Load family's financial year start month setting
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { financeYearStartMonth: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7

  // Default to current financial year based on family's FY start month
  const fyStartYear = currentFyYear(fyStartMonth)
  const { start: defaultFrom, end: defaultTo } = fyDateRange(fyStartYear, fyStartMonth)

  const from = fromRaw ? new Date(fromRaw) : defaultFrom
  const to   = toRaw   ? new Date(toRaw)   : defaultTo

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

  // ── 3. Categories with tax settings ────────────────────────────────────
  const taxCategories = await prisma.financeCategory.findMany({
    where: {
      familyId,
      OR: [{ isTaxDeduction: true }, { taxIncludeInReporting: true }],
    },
    select: {
      id: true, name: true, taxDisplayLabel: true,
      isTaxDeduction: true, taxIncludeInReporting: true,
    },
  })
  const taxCategoryIds = new Set(taxCategories.map(c => c.id))

  // ── 4. Transactions in date range ──────────────────────────────────────
  const txWhere: any = {
    familyId,
    date: { gte: from, lte: to },
    isTransfer: false,
    type: { not: 'opening_balance' },
    OR: [
      { taxClassification: { not: null } },
      { categoryId: { in: [...taxCategoryIds] } },
    ],
  }
  if (entityId) txWhere.entityId = entityId

  const transactions = await prisma.financeTransaction.findMany({
    where: txWhere,
    include: {
      category: { select: { id: true, name: true, taxDisplayLabel: true, type: true, isTaxDeduction: true } },
      entity:   { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  })

  // ── 5. Income entries with tax tracking ───────────────────────────────
  const incomeWhere: any = {
    familyId,
    OR: [{ isTaxTracked: true }, { taxClassification: { not: null } }],
  }
  if (entityId) incomeWhere.entityId = entityId

  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: incomeWhere,
    include: {
      category: { select: { id: true, name: true, taxDisplayLabel: true } },
      entity:   { select: { id: true, name: true } },
    },
    orderBy: { nextExpectedDate: 'desc' },
  })

  // ── 6. Build member name map ───────────────────────────────────────────
  const memberMap = new Map(members.map(m => [m.id, m.name]))

  // ── 7. Serialize transactions ─────────────────────────────────────────
  const serializedTransactions = transactions.map(tx => ({
    id:                      tx.id,
    date:                    tx.date.toISOString().split('T')[0],
    description:             tx.description ?? tx.payee ?? null,
    amount:                  tx.amount,
    type:                    tx.type,
    taxClassification:       tx.taxClassification,
    categoryId:              tx.categoryId,
    categoryName:            tx.category?.name ?? null,
    categoryTaxDisplayLabel: tx.category?.taxDisplayLabel ?? null,
    categoryIsTaxDeduction:  tx.category?.isTaxDeduction ?? false,
    entityId:                tx.entityId,
    entityName:              tx.entity?.name ?? null,
    memberId:                tx.memberId,
    memberName:              tx.memberId ? (memberMap.get(tx.memberId) ?? null) : null,
  }))

  // ── 8. Serialize income entries ───────────────────────────────────────
  const freqMultiplier: Record<string, number> = {
    weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4,
    halfyearly: 2, yearly: 1, 'one-off': 1,
  }

  const serializedIncomeEntries = incomeEntries.map(e => ({
    id:                      e.id,
    name:                    e.name,
    amount:                  e.amount,
    frequency:               e.frequency,
    estimatedAnnual:         e.amount * (freqMultiplier[e.frequency] ?? 12),
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
    from: from.toISOString().split('T')[0],
    to:   to.toISOString().split('T')[0],
    members,
    entities,
    transactions:  serializedTransactions,
    incomeEntries: serializedIncomeEntries,
    taxCategories: taxCategories.map(c => ({
      id:                    c.id,
      name:                  c.name,
      displayLabel:          c.taxDisplayLabel,
      isTaxDeduction:        c.isTaxDeduction,
      taxIncludeInReporting: c.taxIncludeInReporting,
    })),
  })
}
