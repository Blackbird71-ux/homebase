import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// ── Australian tax brackets 2025-26 (excl. Medicare Levy) ──────────────────
const TAX_BRACKETS: { min: number; max: number; base: number; rate: number }[] = [
  { min: 0, max: 18_200, base: 0, rate: 0 },
  { min: 18_201, max: 45_000, base: 0, rate: 0.16 },
  { min: 45_001, max: 135_000, base: 4_288, rate: 0.30 },
  { min: 135_001, max: 190_000, base: 31_288, rate: 0.37 },
  { min: 190_001, max: Infinity, base: 51_638, rate: 0.45 },
]

const MEDICARE_LEVY_RATE = 0.02

function estimateTax(taxableIncome: number): { incomeTax: number; medicareLevy: number; totalTax: number } {
  if (taxableIncome <= 0) return { incomeTax: 0, medicareLevy: 0, totalTax: 0 }

  let incomeTax = 0
  for (const b of TAX_BRACKETS) {
    if (taxableIncome > b.min) {
      const taxableInBracket = Math.min(taxableIncome, b.max) - b.min
      incomeTax = b.base + taxableInBracket * b.rate
    }
  }

  const medicareLevy = taxableIncome * MEDICARE_LEVY_RATE
  return { incomeTax, medicareLevy, totalTax: incomeTax + medicareLevy }
}

// ── Classification detail type ────────────────────────────────────────────
interface ClassificationDetail {
  classification: string
  displayName: string
  totalIncome: number
  totalDeductions: number
  netTaxable: number
  estimatedTax: number
  estimatedMedicare: number
  estimatedTotalTax: number
  transactions: {
    id: string
    date: string
    description: string | null
    amount: number
    type: string
    categoryName: string | null
    categoryTaxDisplayLabel: string | null
    entityName: string | null
    memberName: string | null
  }[]
  incomeEntries: {
    id: string
    name: string
    amount: number
    frequency: string
    estimatedAnnual: number
    taxRate: number | null
    entityName: string | null
    memberName: string | null
  }[]
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const entityId = searchParams.get('entityId') ?? undefined
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')

  // Default to current financial year (July 1 → June 30)
  const now = new Date()
  const currentYear = now.getFullYear()
  const fyStart = now.getMonth() >= 6 ? currentYear : currentYear - 1

  const from = fromRaw ? new Date(fromRaw) : new Date(fyStart, 6, 1) // July 1
  const to = toRaw ? new Date(toRaw) : new Date(fyStart + 1, 6, 0)   // June 30

  // ── 1. Fetch categories with tax settings ──────────────────────────────
  const taxCategories = await prisma.financeCategory.findMany({
    where: {
      familyId: session.familyId,
      OR: [
        { isTaxDeduction: true },
        { taxIncludeInReporting: true },
      ],
    },
    select: { id: true, name: true, taxDisplayLabel: true, isTaxDeduction: true, taxIncludeInReporting: true },
  })
  const taxCategoryIds = new Set(taxCategories.map(c => c.id))
  const categoryLabelMap = new Map(taxCategories.map(c => [c.id, c.taxDisplayLabel ?? c.name]))

  // ── 2. Fetch transactions in date range ────────────────────────────────
  const txWhere: any = {
    familyId: session.familyId,
    date: { gte: from, lte: to },
    OR: [
      { taxClassification: { not: null } },
      { categoryId: { in: [...taxCategoryIds] } },
    ],
  }
  if (entityId) txWhere.entityId = entityId

  const transactions = await prisma.financeTransaction.findMany({
    where: txWhere,
    include: {
      category: { select: { id: true, name: true, taxDisplayLabel: true, type: true } },
      entity: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  })

  // ── 3. Fetch income entries with tax tracking ──────────────────────────
  const incomeWhere: any = {
    familyId: session.familyId,
    OR: [
      { isTaxTracked: true },
      { taxClassification: { not: null } },
    ],
  }
  // Income entries that have been received or are active
  if (entityId) incomeWhere.entityId = entityId

  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: incomeWhere,
    include: {
      entity: { select: { id: true, name: true } },
    },
    orderBy: { nextExpectedDate: 'desc' },
  })

  // ── 4. Build members map ───────────────────────────────────────────────
  const memberIds = new Set<string>()
  transactions.forEach(t => { if (t.memberId) memberIds.add(t.memberId) })
  const members = await prisma.user.findMany({
    where: { id: { in: [...memberIds] }, familyId: session.familyId },
    select: { id: true, name: true },
  })
  const memberMap = new Map(members.map(m => [m.id, m.name]))

  // ── 5. Aggregate by classification ─────────────────────────────────────
  const classificationOrder = ['personal', 'business', 'investment', 'super']
  const classificationDisplay: Record<string, string> = {
    personal: 'Personal',
    business: 'Business',
    investment: 'Investment',
    super: 'Superannuation',
  }

  // Determine classification for each transaction
  function getClassification(
    taxClassification: string | null,
    categoryId: string | null,
    categoryTaxDisplayLabel: string | null,
    categoryType: string | null,
  ): string {
    if (taxClassification) return taxClassification
    if (categoryId && taxCategoryIds.has(categoryId)) {
      // If category has taxIncludeInReporting but no specific classification, use "personal" as default
      return 'personal'
    }
    return 'unclassified'
  }

  const classifiedData = new Map<string, ClassificationDetail>()

  // Initialize classifications
  for (const key of [...classificationOrder, 'unclassified']) {
    classifiedData.set(key, {
      classification: key,
      displayName: classificationDisplay[key] ?? 'Unclassified',
      totalIncome: 0,
      totalDeductions: 0,
      netTaxable: 0,
      estimatedTax: 0,
      estimatedMedicare: 0,
      estimatedTotalTax: 0,
      transactions: [],
      incomeEntries: [],
    })
  }

  // Process transactions
  for (const tx of transactions) {
    const classification = getClassification(
      tx.taxClassification,
      tx.categoryId,
      tx.category?.taxDisplayLabel ?? null,
      tx.category?.type ?? null,
    )
    const entry = classifiedData.get(classification)!
    entry.transactions.push({
      id: tx.id,
      date: tx.date.toISOString().split('T')[0],
      description: tx.description ?? tx.payee ?? '',
      amount: tx.amount,
      type: tx.type,
      categoryName: tx.category?.name ?? null,
      categoryTaxDisplayLabel: tx.category?.taxDisplayLabel ?? null,
      entityName: tx.entity?.name ?? null,
      memberName: memberMap.get(tx.memberId ?? '') ?? null,
    })

    if (tx.type === 'income') {
      entry.totalIncome += tx.amount
    } else if (tx.type === 'expense') {
      entry.totalDeductions += tx.amount
    }
  }

  // Process income entries
  for (const inc of incomeEntries) {
    // Determine classification: use explicit taxClassification if set, otherwise infer
    let classification = inc.taxClassification ?? 'personal'
    if (!classificationOrder.includes(classification)) classification = 'unclassified'

    const entry = classifiedData.get(classification)
    if (!entry) continue

    // Calculate estimated annual amount
    const freqMultiplier: Record<string, number> = {
      weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4,
      halfyearly: 2, yearly: 1, 'one-off': 1,
    }
    const multiplier = freqMultiplier[inc.frequency] ?? 12
    const estimatedAnnual = inc.amount * multiplier

    entry.incomeEntries.push({
      id: inc.id,
      name: inc.name,
      amount: inc.amount,
      frequency: inc.frequency,
      estimatedAnnual,
      taxRate: inc.taxRate ?? null,
      entityName: inc.entity?.name ?? null,
      memberName: null,
    })

    entry.totalIncome += estimatedAnnual
  }

  // ── 6. Calculate tax estimates ─────────────────────────────────────────
  for (const [, entry] of classifiedData) {
    entry.netTaxable = Math.max(0, entry.totalIncome - entry.totalDeductions)
    const tax = estimateTax(entry.netTaxable)
    entry.estimatedTax = tax.incomeTax
    entry.estimatedMedicare = tax.medicareLevy
    entry.estimatedTotalTax = tax.totalTax
  }

  // ── 7. Remove empty/unused classifications ─────────────────────────────
  const result = [...classifiedData.entries()]
    .filter(([_, v]) => v.totalIncome > 0 || v.totalDeductions > 0 || v.transactions.length > 0 || v.incomeEntries.length > 0)
    .sort((a, b) => {
      const ai = classificationOrder.indexOf(a[0])
      const bi = classificationOrder.indexOf(b[0])
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    .map(([_, v]) => v)

  return NextResponse.json({
    financialYear: `${fyStart}-${fyStart + 1}`,
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
    classifications: result,
    taxCategories: taxCategories.map(c => ({
      id: c.id,
      name: c.name,
      displayLabel: c.taxDisplayLabel,
      isTaxDeduction: c.isTaxDeduction,
      taxIncludeInReporting: c.taxIncludeInReporting,
    })),
  })
}
