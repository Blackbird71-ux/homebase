'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Receipt, AlertTriangle, ChevronLeft, ChevronRight, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { currentFyYear, fyLabel as fyLabelUtil, fyDateRange } from '@/lib/finance-fy'
import { calcIncomeTax, calcMedicare, calcPersonalTax, SUPER_CAP } from '@/lib/tax-calculator'
import { format } from 'date-fns'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'
import { ExcelButton } from '@/components/print/ExcelButton'
import * as XLSX from 'xlsx'
import {
  buildCoverSheet, headerStyle, headerLeftStyle, sectionStyle,
  totalStyle, totalLabelStyle, grandTotalStyle, grandTotalLabelStyle,
  dataStyle, dataLabelStyle,
  setCols, freeze, styleRow, sc, FMT,
} from '@/lib/excelStyles'

// ── Types ─────────────────────────────────────────────────────────────────────

// GlActualItem — one posted journal line on a tax-relevant GL account.
// This IS the authoritative number; it agrees with Trial Balance by construction.
interface GlActualItem {
  journalEntryId: string
  reference: string
  date: string
  description: string
  entryType: string
  amount: number               // net movement on the account (positive = normal side)
  side: string
  glAccountId: string
  glAccountName: string
  glAccountType: string
  taxDisplayLabel: string | null
  isTaxDeduction: boolean
  taxIncludeInReporting: boolean
  entityId: string | null
  entityName: string | null
  memberId?: string | null      // carried through from journal line when available
}

// IncomeRow — master income stream projection (planning data only).
// parentIncomeId: null filter is enforced server-side; each entry here
// represents one income stream, not individual received occurrences.
interface IncomeRow {
  id: string; name: string; amount: number; frequency: string
  estimatedAnnual: number; isTaxTracked: boolean; taxRate: number | null
  taxClassification: string | null
  categoryId: string | null; categoryName: string | null; categoryTaxDisplayLabel: string | null
  entityId: string | null; entityName: string | null
  memberId: string | null; memberName: string | null
}

interface Member  { id: string; name: string }
interface Entity  { id: string; name: string; type: string; isDefault: boolean }
interface TaxCat  { id: string; name: string; displayLabel: string | null; isTaxDeduction: boolean; taxIncludeInReporting: boolean }

interface ApiResponse {
  financialYear: string; from: string; to: string
  members: Member[]; entities: Entity[]
  // GL actuals — authoritative figures from posted journal lines
  glActuals: GlActualItem[]
  // Income stream projections — annualised master-entry estimates
  incomeEstimates: IncomeRow[]
  // Legacy aliases kept for backward compat (same data, different field names)
  transactions: GlActualItem[]
  incomeEntries: IncomeRow[]
  taxCategories: TaxCat[]
  source?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ── Per-person aggregation ────────────────────────────────────────────────────

// PersonTax holds two independent columns:
//   actuals   — what was actually posted to the GL in the FY (statutory figures)
//   projected — annualised income stream estimates (forward-looking planning)
//
// Both run through the same tax bracket calculator so the user can see
// "what I actually earned this FY" vs "what I expect for the full year".

interface TaxColumn {
  wages: number; bankInterest: number; otherIncome: number; frankingCredits: number
  grossIncome: number; voluntarySuper: number; charity: number; otherDeductions: number
  totalDeductions: number; taxableIncome: number; perWeek: number
  incomeTax: number; medicare: number; totalTaxPayable: number
  paygWithheld: number; paygInstalments: number; frankingOffset: number
  totalCredits: number; refundOrOwing: number
  sgcAmount: number; voluntarySuperForCap: number
  incomeLines: { label: string; amount: number }[]
  deductionLines: { label: string; amount: number }[]
  creditLines: { label: string; amount: number }[]
}

interface PersonTax {
  actuals: TaxColumn
  projected: TaxColumn
}

function buildTaxColumn(
  incomeLines_: { label: string; amount: number }[],
  wages: number,
  bankInterest: number,
  otherIncome: number,
  frankingCredits: number,
  voluntarySuper: number,
  charity: number,
  otherDeductions: number,
  paygWithheld: number,
  paygInstalments: number,
  sgcAmount: number,
): TaxColumn {
  const grossIncome    = wages + bankInterest + otherIncome + frankingCredits
  const totalDeductions = voluntarySuper + charity + otherDeductions
  const taxableIncome  = Math.max(0, grossIncome - totalDeductions)
  const perWeek        = Math.round(taxableIncome / 52)
  const { incomeTax, medicare, total: totalTaxBeforeFranking } = calcPersonalTax(taxableIncome)
  const totalTaxPayable = Math.max(0, totalTaxBeforeFranking - frankingCredits)
  const totalCredits   = paygWithheld + paygInstalments + frankingCredits
  const refundOrOwing  = totalCredits - totalTaxPayable

  const deductionLines: { label: string; amount: number }[] = []
  if (voluntarySuper > 0)  deductionLines.push({ label: 'Voluntary Super', amount: voluntarySuper })
  if (charity > 0)         deductionLines.push({ label: 'Charity / Gifts', amount: charity })
  if (otherDeductions > 0) deductionLines.push({ label: 'Other Deductions', amount: otherDeductions })

  const creditLines: { label: string; amount: number }[] = []
  if (paygWithheld > 0)    creditLines.push({ label: 'PAYG Withheld', amount: paygWithheld })
  if (paygInstalments > 0) creditLines.push({ label: 'PAYG Instalments', amount: paygInstalments })
  if (frankingCredits > 0) creditLines.push({ label: 'Franking Credit Offset', amount: frankingCredits })

  return {
    wages, bankInterest, otherIncome, frankingCredits, grossIncome,
    voluntarySuper, charity, otherDeductions, totalDeductions,
    taxableIncome, perWeek, incomeTax, medicare, totalTaxPayable,
    paygWithheld, paygInstalments, frankingOffset: frankingCredits,
    totalCredits, refundOrOwing, sgcAmount, voluntarySuperForCap: voluntarySuper,
    incomeLines: incomeLines_, deductionLines, creditLines,
  }
}

function buildPersonTax(
  memberId: string,
  data: ApiResponse,
  jointActualsHalf: number,
  jointProjectedHalf: number,
): PersonTax {
  // ── Helper matchers ──────────────────────────────────────────────────────
  const matchGlLabel = (item: GlActualItem, p: RegExp) =>
    p.test((item.taxDisplayLabel ?? '') + ' ' + item.glAccountName + ' ' + item.description)

  const matchIncomeLabel = (e: IncomeRow, p: RegExp) =>
    p.test(e.name + ' ' + (e.categoryName ?? '') + ' ' + (e.categoryTaxDisplayLabel ?? ''))

  // ── ACTUALS column — from posted GL journal lines ────────────────────────
  // glActuals carries the memberId on the journal line when the source bill/
  // income entry had a memberId. For lines without memberId (null), we treat
  // them as joint and split them outside this function (same as before).
  const memberGlLines = data.glActuals.filter(l => l.memberId === memberId)

  // Income GL lines: credit-side movements on income-type accounts
  const glIncomeLines = memberGlLines.filter(l =>
    l.glAccountType === 'income' && l.taxIncludeInReporting && l.amount > 0
  )
  const glWageLines   = glIncomeLines.filter(l => matchGlLabel(l, /salary|wages/i))
  const glFrankLines  = glIncomeLines.filter(l => matchGlLabel(l, /franking|input credit/i))
  const glOtherInc    = glIncomeLines.filter(l => !matchGlLabel(l, /salary|wages|franking|input credit/i))

  const glWages    = glWageLines.reduce((s, l) => s + l.amount, 0)
  const glFranking = glFrankLines.reduce((s, l) => s + l.amount, 0)
  const glOther    = glOtherInc.reduce((s, l) => s + l.amount, 0)

  // Deductions GL lines: debit-side movements on deductible expense accounts
  const glDeductLines = memberGlLines.filter(l => l.isTaxDeduction && l.amount > 0)
  const glVolSuper  = glDeductLines.filter(l => matchGlLabel(l, /super/i)).reduce((s, l) => s + l.amount, 0)
  const glCharity   = glDeductLines.filter(l => matchGlLabel(l, /charity|gift|donation/i)).reduce((s, l) => s + l.amount, 0)
  const glOtherDed  = glDeductLines.filter(l => !matchGlLabel(l, /super|charity|gift|donation/i)).reduce((s, l) => s + l.amount, 0)

  // Tax payments GL: tax_payment classified lines
  const glTaxLines  = memberGlLines.filter(l => (l as any).taxClassification === 'tax_payment')
  const glPaygWith  = glTaxLines.filter(l => matchGlLabel(l, /payg|withh/i)).reduce((s, l) => s + l.amount, 0)
  const glPaygInst  = glTaxLines.filter(l => !matchGlLabel(l, /payg|withh/i)).reduce((s, l) => s + l.amount, 0)

  // SGC — employer super on GL (informational, not a deduction for the individual)
  const glSgc = memberGlLines.filter(l => matchGlLabel(l, /sgc|employer.*super/i)).reduce((s, l) => s + l.amount, 0)

  const actualsIncomeLines: { label: string; amount: number }[] = []
  if (glWages > 0)             actualsIncomeLines.push({ label: 'Wages / Salary', amount: glWages })
  if (jointActualsHalf > 0)    actualsIncomeLines.push({ label: 'Bank Interest (joint ÷2)', amount: jointActualsHalf })
  glOtherInc.forEach(l => {
    if (l.amount > 0) actualsIncomeLines.push({ label: l.taxDisplayLabel ?? l.glAccountName, amount: l.amount })
  })
  if (glFranking > 0)          actualsIncomeLines.push({ label: 'Franking Credits', amount: glFranking })

  const actualsCol = buildTaxColumn(
    actualsIncomeLines,
    glWages, jointActualsHalf, glOther, glFranking,
    glVolSuper, glCharity, glOtherDed,
    glPaygWith, glPaygInst,
    glSgc,
  )

  // ── PROJECTED column — from master income stream estimates ───────────────
  // incomeEntries are master-entry projections (parentIncomeId: null filter
  // applied server-side). Each entry represents the annual run-rate of a
  // single income stream, annualised by the server using the correct multiplier.
  const memberInc = data.incomeEntries.filter(e => e.memberId === memberId)

  const wageEntries        = memberInc.filter(e => matchIncomeLabel(e, /salary|wages/i))
  const frankingEntries    = memberInc.filter(e => matchIncomeLabel(e, /franking|input credit/i))
  const otherIncomeEntries = memberInc.filter(e =>
    !matchIncomeLabel(e, /salary|wages|franking|input credit/i)
  )

  const projWages    = wageEntries.reduce((s, e) => s + e.estimatedAnnual, 0)
  const projFranking = frankingEntries.reduce((s, e) => s + e.estimatedAnnual, 0)
  const projOther    = otherIncomeEntries.reduce((s, e) => s + e.estimatedAnnual, 0)

  // Deductions from incomeEntries are not available (they come from bills/transactions).
  // For the projected column we reuse the GL actuals for deductions and credits —
  // there is no way to "project" future deductions from income stream data alone.
  // This is intentional: deductions are claim-based, not frequency-based.
  const projIncomeLines: { label: string; amount: number }[] = []
  if (projWages > 0)          projIncomeLines.push({ label: 'Wages / Salary', amount: projWages })
  if (jointProjectedHalf > 0) projIncomeLines.push({ label: 'Bank Interest (joint ÷2)', amount: jointProjectedHalf })
  otherIncomeEntries.forEach(e => {
    if (e.estimatedAnnual > 0)
      projIncomeLines.push({ label: e.categoryTaxDisplayLabel ?? e.name, amount: e.estimatedAnnual })
  })
  if (projFranking > 0)       projIncomeLines.push({ label: 'Franking Credits', amount: projFranking })

  const projSgc = data.incomeEntries
    .filter(e => e.memberId === memberId && /sgc|employer.*super/i.test(e.name + ' ' + (e.categoryName ?? '')))
    .reduce((s, e) => s + e.estimatedAnnual, 0)

  const projectedCol = buildTaxColumn(
    projIncomeLines,
    projWages, jointProjectedHalf, projOther, projFranking,
    // reuse GL deductions & credits for projected column
    glVolSuper, glCharity, glOtherDed,
    glPaygWith, glPaygInst,
    projSgc,
  )

  return { actuals: actualsCol, projected: projectedCol }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LineRow({ label, amount, color, bold, indent }: {
  label: string; amount: number; color?: string; bold?: boolean; indent?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-0.5 text-sm', indent && 'pl-4')}>
      <span className={cn('text-muted-foreground', bold && 'font-semibold text-foreground')}>{label}</span>
      <span className={cn('tabular-nums font-medium', color ?? 'text-foreground', bold && 'font-bold')}>{fmt(amount)}</span>
    </div>
  )
}

function Divider() { return <div className="border-t border-border my-1" /> }

function SectionHeader({ label }: { label: string }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">{label}</p>
}

// TaxColumnView renders one column (actuals or projected) of per-person tax data
function TaxColumnView({ col, fy, label, isProjected }: {
  col: TaxColumn; fy: string; label: string; isProjected: boolean
}) {
  const cap          = SUPER_CAP[fy] ?? 30_000
  const totalSuper   = col.sgcAmount + col.voluntarySuperForCap
  const superPct     = Math.min(100, Math.round((totalSuper / cap) * 100))
  const superExceeds = totalSuper > cap
  const isRefund     = col.refundOrOwing >= 0

  return (
    <div className={cn(
      'flex-1 min-w-0 rounded-lg border p-4 space-y-0.5',
      isProjected
        ? 'border-blue-500/20 bg-blue-500/5'
        : 'border-border',
    )}>
      {/* Column label */}
      <div className="flex items-center gap-2 mb-3">
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
          isProjected
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        )}>
          {label}
        </span>
        {isProjected && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" /> annualised estimate
          </span>
        )}
        {!isProjected && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" /> from GL (authoritative)
          </span>
        )}
      </div>

      <SectionHeader label="Gross Income" />
      {col.incomeLines.length > 0
        ? col.incomeLines.map(l => <LineRow key={l.label} label={l.label} amount={l.amount} indent />)
        : <p className="text-xs text-muted-foreground pl-4 pb-1">No income recorded</p>}
      <Divider />
      <LineRow label="Total Gross Income" amount={col.grossIncome} bold color="text-green-600 dark:text-green-400" />

      {col.totalDeductions > 0 && (<>
        <SectionHeader label="Deductions" />
        {col.deductionLines.map(l => <LineRow key={l.label} label={l.label} amount={l.amount} indent />)}
        <Divider />
        <LineRow label="Total Deductions" amount={col.totalDeductions} bold color="text-red-600 dark:text-red-400" />
      </>)}

      <Divider />
      <LineRow label="Total Taxable Income" amount={col.taxableIncome} bold />
      <div className="flex items-center justify-between text-xs text-muted-foreground pl-4">
        <span>Per week</span>
        <span className="tabular-nums">{fmt(col.perWeek)}</span>
      </div>

      <SectionHeader label="Tax Calculation" />
      <LineRow label="Income tax (brackets)" amount={col.incomeTax} indent />
      <LineRow label="Medicare levy (2%)" amount={col.medicare} indent />
      {col.frankingOffset > 0 && (
        <LineRow label="Less: Franking credits" amount={-col.frankingOffset} indent color="text-green-600 dark:text-green-400" />
      )}
      <Divider />
      <LineRow label="Tax Payable" amount={col.totalTaxPayable} bold color="text-orange-600 dark:text-orange-400" />

      <SectionHeader label="Tax Already Paid" />
      {col.creditLines.length > 0
        ? col.creditLines.map(l => (
            <LineRow key={l.label} label={l.label} amount={l.amount} indent color="text-green-600 dark:text-green-400" />
          ))
        : <p className="text-xs text-muted-foreground pl-4">No credits recorded</p>}
      <Divider />
      <LineRow label="Total Credits" amount={col.totalCredits} bold color="text-green-600 dark:text-green-400" />

      <div className={cn(
        'mt-3 rounded-md p-3 flex items-center justify-between',
        isRefund ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30',
      )}>
        <span className={cn('text-sm font-bold', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
          {isRefund ? '← REFUND' : 'OWING →'}
        </span>
        <span className={cn('text-lg font-bold tabular-nums', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
          {fmt(Math.abs(col.refundOrOwing))}
        </span>
      </div>

      {/* Super cap tracker */}
      <div className="mt-3 pt-3 border-t border-border space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Super cap ({fmt(cap)})</span>
          <span className={cn('font-semibold tabular-nums',
            superExceeds ? 'text-red-500' : superPct >= 90 ? 'text-amber-500' : 'text-green-600 dark:text-green-400')}>
            {fmt(totalSuper)} used
          </span>
        </div>
        {col.sgcAmount > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground pl-3">
            <span>SGC (employer)</span><span>{fmt(col.sgcAmount)}</span>
          </div>
        )}
        {col.voluntarySuperForCap > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground pl-3">
            <span>Voluntary</span><span>{fmt(col.voluntarySuperForCap)}</span>
          </div>
        )}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full', superExceeds ? 'bg-red-500' : superPct >= 90 ? 'bg-amber-500' : 'bg-green-500')}
            style={{ width: `${superPct}%` }}
          />
        </div>
        {superExceeds
          ? <p className="text-[10px] text-red-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Exceeds cap by {fmt(totalSuper - cap)}
            </p>
          : <p className="text-[10px] text-muted-foreground">{fmt(cap - totalSuper)} remaining</p>}
      </div>
    </div>
  )
}

function PersonPanel({ name, p, fy }: { name: string; p: PersonTax; fy: string }) {
  const hasActuals   = p.actuals.grossIncome > 0 || p.actuals.totalDeductions > 0
  const hasProjected = p.projected.grossIncome > 0

  return (
    <div className="rounded-lg border border-border overflow-hidden flex-1 min-w-0">
      <div className="bg-muted/40 px-4 py-3 border-b border-border">
        <h3 className="font-bold text-base">{name}</h3>
      </div>
      <div className="p-4 space-y-3">
        {/* Always show both columns side by side when both have data; fall back gracefully */}
        <div className="flex gap-3 flex-wrap lg:flex-nowrap">
          {hasActuals ? (
            <TaxColumnView col={p.actuals} fy={fy} label="Actuals" isProjected={false} />
          ) : (
            <div className="flex-1 min-w-0 rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">No GL-posted income this FY yet.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Mark income as received to post it to the GL.</p>
            </div>
          )}
          {hasProjected ? (
            <TaxColumnView col={p.projected} fy={fy} label="Projected" isProjected={true} />
          ) : (
            <div className="flex-1 min-w-0 rounded-lg border border-dashed border-blue-500/20 bg-blue-500/5 p-4 text-center">
              <p className="text-xs text-muted-foreground">No projected income streams set up.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Add income entries marked "Track for tax" to see projections.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EntitySection({ entityName, taxRate, data, entityId }: {
  entityName: string; taxRate: number; data: ApiResponse; entityId: string
}) {
  // Entity income: use GL actuals (income-type accounts posted in FY for this entity)
  const entityGlIncome  = data.glActuals.filter(l =>
    l.entityId === entityId && l.glAccountType === 'income' && l.taxIncludeInReporting && l.amount > 0
  )
  // Entity expenses: deductible expense GL lines
  const entityGlExpense = data.glActuals.filter(l =>
    l.entityId === entityId && l.isTaxDeduction && l.amount > 0
  )
  // PAYG payments: tax_payment classified lines for this entity (from transactions legacy field)
  const entityTxPayments = (data.transactions as any[]).filter((t: any) =>
    t.entityId === entityId && (t.taxClassification === 'tax_payment' || t.type === 'tax_payment')
  )

  const totalIncome   = entityGlIncome.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = entityGlExpense.reduce((s, l) => s + l.amount, 0)
  const taxableIncome = Math.max(0, totalIncome - totalExpenses)
  const taxPayable    = Math.round(taxableIncome * taxRate)
  const paygPaid      = entityTxPayments.reduce((s: number, t: any) => s + (t.amount ?? 0), 0)
  const owing         = taxPayable - paygPaid
  const quarterly     = Math.round(taxPayable / 4)

  // Also show projected income from incomeEstimates for this entity
  const entityIncomeEstimates = data.incomeEstimates.filter(e => e.entityId === entityId)
  const projectedIncome = entityIncomeEstimates.reduce((s, e) => s + e.estimatedAnnual, 0)

  if (totalIncome === 0 && totalExpenses === 0 && projectedIncome === 0) return null

  const isRefund = owing <= 0
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{entityName}</h3>
        <span className="text-xs text-muted-foreground">{taxRate * 100}% tax rate</span>
      </div>
      <div className="p-4 space-y-0.5">
        {totalIncome > 0 && (<>
          <SectionHeader label="Income (GL Actuals)" />
          {entityGlIncome.map(l => (
            <LineRow key={l.journalEntryId + l.glAccountId} label={l.taxDisplayLabel ?? l.glAccountName} amount={l.amount} indent />
          ))}
          <Divider />
          <LineRow label="Total Income" amount={totalIncome} bold color="text-green-600 dark:text-green-400" />
        </>)}

        {projectedIncome > 0 && totalIncome === 0 && (<>
          <SectionHeader label="Projected Income (estimates)" />
          {entityIncomeEstimates.map(e => (
            <LineRow key={e.id} label={e.categoryTaxDisplayLabel ?? e.name} amount={e.estimatedAnnual} indent />
          ))}
          <Divider />
          <LineRow label="Total Projected" amount={projectedIncome} bold color="text-blue-600 dark:text-blue-400" />
        </>)}

        {totalExpenses > 0 && (<>
          <SectionHeader label="Deductible Expenses" />
          {entityGlExpense.map(l => (
            <LineRow key={l.journalEntryId + l.glAccountId} label={l.taxDisplayLabel ?? l.glAccountName} amount={l.amount} indent />
          ))}
          <Divider />
          <LineRow label="Total Expenses" amount={totalExpenses} bold color="text-red-600 dark:text-red-400" />
        </>)}

        {totalIncome > 0 && (<>
          <Divider />
          <LineRow label="Taxable Income" amount={taxableIncome} bold />
          <LineRow label={`Tax @ ${taxRate * 100}%`} amount={taxPayable} color="text-orange-600 dark:text-orange-400" />
          {paygPaid > 0 && (
            <LineRow label="Less: PAYG Instalments Paid" amount={paygPaid} color="text-green-600 dark:text-green-400" />
          )}
          <div className={cn(
            'mt-3 rounded-md p-3 flex items-center justify-between',
            isRefund ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30',
          )}>
            <span className={cn('text-sm font-bold', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
              {isRefund ? '← REFUND' : 'OWING →'}
            </span>
            <span className={cn('text-lg font-bold tabular-nums', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
              {fmt(Math.abs(owing))}
            </span>
          </div>
          {quarterly > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Quarterly BAS instalment estimate: <strong>{fmt(quarterly)}</strong>
            </p>
          )}
        </>)}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TaxReportPage() {
  const [data, setData]                 = useState<ApiResponse | null>(null)
  const [loading, setLoading]           = useState(true)
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [fyStartYear, setFyStartYear]   = useState<number>(() => currentFyYear(7))
  const printRef = useRef<HTMLDivElement>(null)

  // ── Build Excel workbook ─────────────────────────────────────────────────
  function buildExcelWorkbook(): XLSX.WorkBook {
    const wb  = XLSX.utils.book_new()
    const now = format(new Date(), 'd MMM yyyy h:mm a')
    const fyStr = fyLabelUtil(fyStartYear, fyStartMonth)

    XLSX.utils.book_append_sheet(wb, buildCoverSheet({
      reportTitle: 'Tax Report',
      dateRange:   fyStr,
      generatedAt: now,
      disclaimer:  'Actuals are GL-sourced (authoritative). Projected figures are annualised estimates only — based on 2025-26 ATO tax brackets. This is not tax advice. Consult your registered tax agent or accountant before lodging.',
    }), 'Info')

    if (!data) return wb

    // ── Per-person dual-column summary ──────────────────────────────────────
    const colGroups = personData.flatMap(p => [
      `${p.member.name} (Actuals)`,
      `${p.member.name} (Projected)`,
    ])
    const cols = [32, ...personData.flatMap(() => [18, 18])]
    const aoa: any[][] = []
    aoa.push([`Tax Report — ${fyStr}`, ...colGroups.map(() => '')])
    aoa.push(['', ...colGroups])

    const pushSection = (label: string) => aoa.push([label, ...colGroups.map(() => '')])
    const pushRow = (label: string, vals: (number | string)[]) => aoa.push([label, ...vals])
    const pCols = (getter: (col: TaxColumn) => number) =>
      personData.flatMap(p => [getter(p.tax.actuals), getter(p.tax.projected)])

    pushSection('GROSS INCOME')
    pushRow('Wages / Salary',           pCols(c => c.wages))
    pushRow('Bank Interest (joint ÷2)', pCols(c => c.bankInterest))
    pushRow('Other Income',             pCols(c => c.otherIncome))
    pushRow('Franking Credits',         pCols(c => c.frankingCredits))
    pushRow('Total Gross Income',       pCols(c => c.grossIncome))

    aoa.push([])
    pushSection('DEDUCTIONS')
    pushRow('Voluntary Super',          pCols(c => c.voluntarySuper))
    pushRow('Charity / Gifts',          pCols(c => c.charity))
    pushRow('Other Deductions',         pCols(c => c.otherDeductions))
    pushRow('Total Deductions',         pCols(c => c.totalDeductions))

    aoa.push([])
    pushSection('TAXABLE INCOME')
    pushRow('Total Taxable Income',     pCols(c => c.taxableIncome))
    pushRow('Per Week',                 pCols(c => c.perWeek))

    aoa.push([])
    pushSection('TAX CALCULATION')
    pushRow('Income Tax (brackets)',    pCols(c => c.incomeTax))
    pushRow('Medicare Levy (2%)',       pCols(c => c.medicare))
    pushRow('Less: Franking Credits',   pCols(c => -c.frankingOffset))
    pushRow('Tax Payable',              pCols(c => c.totalTaxPayable))

    aoa.push([])
    pushSection('TAX ALREADY PAID')
    pushRow('PAYG Withheld',            pCols(c => c.paygWithheld))
    pushRow('PAYG Instalments',         pCols(c => c.paygInstalments))
    pushRow('Total Credits',            pCols(c => c.totalCredits))

    aoa.push([])
    pushSection('RESULT')
    pushRow('REFUND / (OWING)',         pCols(c => c.refundOrOwing))

    aoa.push([])
    pushSection('SUPER CAP')
    const cap = SUPER_CAP[data.financialYear] ?? 30_000
    const capFmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cap)
    pushRow(`Super Cap (${capFmt})`,    pCols(() => cap))
    pushRow('SGC (Employer)',           pCols(c => c.sgcAmount))
    pushRow('Voluntary Super',          pCols(c => c.voluntarySuperForCap))
    pushRow('Total Used',               pCols(c => c.sgcAmount + c.voluntarySuperForCap))
    pushRow('Remaining',                pCols(c => Math.max(0, cap - c.sgcAmount - c.voluntarySuperForCap)))

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    setCols(ws, cols)
    freeze(ws, 2, 1)

    const numCols = colGroups.length
    styleRow(ws, 0, 0, numCols, headerLeftStyle())
    styleRow(ws, 1, 0, numCols, headerStyle())
    sc(ws, 1, 0, headerLeftStyle())

    const sectionRows = ['GROSS INCOME','DEDUCTIONS','TAXABLE INCOME','TAX CALCULATION','TAX ALREADY PAID','RESULT','SUPER CAP']
    const totalRows   = ['Total Gross Income','Total Deductions','Total Taxable Income','Tax Payable','Total Credits']
    const grandRows   = ['REFUND / (OWING)']

    let dataIdx = 0
    for (let r = 2; r < aoa.length; r++) {
      const row = aoa[r]
      if (!row?.length || !row[0]) { dataIdx = 0; continue }
      const lbl = String(row[0])
      if (sectionRows.includes(lbl)) {
        styleRow(ws, r, 0, numCols, sectionStyle()); dataIdx = 0
      } else if (totalRows.includes(lbl)) {
        sc(ws, r, 0, totalLabelStyle())
        for (let c = 1; c <= numCols; c++) sc(ws, r, c, totalStyle())
      } else if (grandRows.includes(lbl)) {
        sc(ws, r, 0, grandTotalLabelStyle())
        for (let c = 1; c <= numCols; c++) {
          const val = row[c] as number
          sc(ws, r, c, val >= 0
            ? { ...grandTotalStyle(), font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 11 } }
            : { ...grandTotalStyle(), font: { bold: true, color: { rgb: 'FFC7CE' }, name: 'Arial', sz: 11 } })
        }
      } else {
        const alt = dataIdx % 2 === 1
        sc(ws, r, 0, dataLabelStyle(alt))
        for (let c = 1; c <= numCols; c++) sc(ws, r, c, dataStyle(alt))
        dataIdx++
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Tax Summary')
    return wb
  }

  // Load settings for FY start month
  useEffect(() => {
    async function loadSettings() {
      try {
        const familyRes = await fetch('/api/settings/family')
        if (familyRes.ok) {
          const family = await familyRes.json()
          const fsm = family.financeYearStartMonth ?? 7
          setFyStartMonth(fsm)
          setFyStartYear(currentFyYear(fsm))
        }
      } catch { /* ignore */ }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (entityFilter) params.set('entityId', entityFilter)
        const { start, end } = fyDateRange(fyStartYear, fyStartMonth)
        params.set('from', start.toISOString().split('T')[0])
        params.set('to', end.toISOString().split('T')[0])
        const res = await fetch(`/api/finance/tax-report?${params}`)
        if (!res.ok) { toast.error('Failed to load tax report'); return }
        const json = await res.json()
        // Normalise: ensure glActuals and incomeEstimates fields exist regardless of
        // which version of the API this response came from.
        if (!json.glActuals)       json.glActuals = json.transactions ?? []
        if (!json.incomeEstimates) json.incomeEstimates = json.incomeEntries ?? []
        setData(json)
      } catch { toast.error('Failed to load tax report') }
      finally { setLoading(false) }
    }
    load()
  }, [entityFilter, fyStartYear, fyStartMonth])

  // Joint income: GL actuals with no memberId on the default entity
  const jointActualsIncome = useMemo(() => {
    if (!data) return 0
    const defaultEntityIds = new Set(data.entities.filter(e => e.isDefault).map(e => e.id))
    return data.glActuals
      .filter(l =>
        !l.memberId &&
        l.glAccountType === 'income' &&
        l.taxIncludeInReporting &&
        l.amount > 0 &&
        (!l.entityId || defaultEntityIds.has(l.entityId))
      )
      .reduce((s, l) => s + l.amount, 0)
  }, [data])

  // Joint projected income: incomeEstimates with no memberId on the default entity
  const jointProjectedIncome = useMemo(() => {
    if (!data) return 0
    const defaultEntityIds = new Set(data.entities.filter(e => e.isDefault).map(e => e.id))
    return data.incomeEstimates
      .filter(e => !e.memberId && (!e.entityId || defaultEntityIds.has(e.entityId)))
      .reduce((s, e) => s + e.estimatedAnnual, 0)
  }, [data])

  const memberCount        = data?.members.length ?? 1
  const jointActualsHalf   = jointActualsIncome   / Math.max(1, memberCount)
  const jointProjectedHalf = jointProjectedIncome / Math.max(1, memberCount)

  const personData = useMemo(() => {
    if (!data) return []
    return data.members.map(m => ({
      member: m,
      tax: buildPersonTax(m.id, data, jointActualsHalf, jointProjectedHalf),
    }))
  }, [data, jointActualsHalf, jointProjectedHalf])

  const combinedActualsRefund    = personData.reduce((s, p) => s + p.tax.actuals.refundOrOwing, 0)
  const combinedProjectedRefund  = personData.reduce((s, p) => s + p.tax.projected.refundOrOwing, 0)
  const superEntities   = data?.entities.filter(e => e.type === 'superfund') ?? []
  const companyEntities = data?.entities.filter(e => e.type === 'business' || e.type === 'trust') ?? []
  const fy              = data?.financialYear ?? '2025-26'
  const hasAnyData      = personData.length > 0 || superEntities.length > 0 || companyEntities.length > 0

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Loading tax report…</div>
  if (!data)   return null

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Receipt className="h-5 w-5 text-orange-500" /> Tax Report
              </h2>
              <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5">
                <button onClick={() => setFyStartYear(y => y - 1)} className="p-0.5 hover:bg-accent rounded text-muted-foreground">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-semibold px-1 min-w-[70px] text-center">
                  {fyLabelUtil(fyStartYear, fyStartMonth)}
                </span>
                <button onClick={() => setFyStartYear(y => y + 1)} className="p-0.5 hover:bg-accent rounded text-muted-foreground">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{data.from} – {data.to}</p>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-1.5 max-w-sm">
            Estimated only — based on 2025-26 ATO brackets. Consult your accountant for final figures.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton
            printRef={printRef}
            reportTitle="Tax Report"
            dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
            disabled={loading}
          />
          <ExcelButton
            buildWorkbook={buildExcelWorkbook}
            filename={`HomeBase - Tax Report - ${fyLabelUtil(fyStartYear, fyStartMonth)}.xlsx`}
            disabled={loading}
          />
        </div>
      </div>

      {/* Column legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
          <span className="font-semibold">Actuals</span>
          <span className="text-emerald-600/70 dark:text-emerald-400/70">— GL-posted figures (authoritative; agrees with Trial Balance)</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400">
          <span className="font-semibold">Projected</span>
          <span className="text-blue-600/70 dark:text-blue-400/70">— Annualised income stream estimates (planning only)</span>
        </div>
      </div>

      {/* ── Printable region ────────────────────────────────────────────────── */}
      <PrintWrapper
        ref={printRef}
        reportTitle="Tax Report"
        dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
        meta={`${data?.from ?? ''} – ${data?.to ?? ''} · Actuals from GL · Projected from income stream estimates`}
      >

      {/* Entity filter */}
      {data.entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setEntityFilter('')}
            className={cn('px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              !entityFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            All
          </button>
          {data.entities.map(en => (
            <button key={en.id} onClick={() => setEntityFilter(entityFilter === en.id ? '' : en.id)}
              className={cn('px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                entityFilter === en.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {en.name}
            </button>
          ))}
        </div>
      )}

      {/* Joint income disclosure */}
      {(jointActualsIncome > 0 || jointProjectedIncome > 0) && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-semibold text-sm mb-1">Joint Income</h3>
          <div className="flex gap-4 flex-wrap">
            {jointActualsIncome > 0 && (
              <div className="flex-1 min-w-[160px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Actuals</p>
                <LineRow label="Total Joint Income" amount={jointActualsIncome} bold color="text-green-600 dark:text-green-400" />
              </div>
            )}
            {jointProjectedIncome > 0 && (
              <div className="flex-1 min-w-[160px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Projected</p>
                <LineRow label="Total Joint Projected" amount={jointProjectedIncome} bold color="text-blue-600 dark:text-blue-400" />
              </div>
            )}
          </div>
          {memberCount > 1 && (
            <p className="text-xs text-muted-foreground">
              Split equally across {memberCount} members ({fmt(jointActualsHalf || jointProjectedHalf)} each).
            </p>
          )}
        </div>
      )}

      {/* Per-person panels */}
      {personData.length > 0 && (<>
        <div className="flex gap-4 flex-wrap lg:flex-nowrap">
          {personData.map(({ member, tax }) => (
            <PersonPanel key={member.id} name={member.name} p={tax} fy={fy} />
          ))}
        </div>

        {/* Combined summary bar */}
        {personData.length > 1 && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Combined Actuals',   val: combinedActualsRefund,   projected: false },
              { label: 'Combined Projected', val: combinedProjectedRefund, projected: true  },
            ].map(({ label, val, projected }) => (
              <div key={label} className={cn(
                'rounded-lg border p-4 flex items-center justify-between',
                val >= 0
                  ? projected ? 'border-blue-500/20 bg-blue-500/5' : 'border-green-500/30 bg-green-500/5'
                  : projected ? 'border-red-500/20  bg-red-500/5'  : 'border-red-500/30  bg-red-500/5',
              )}>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                  <span className={cn('font-bold text-sm',
                    val >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                    {val >= 0 ? 'Refund' : 'Owing'}
                  </span>
                </div>
                <span className={cn('text-xl font-bold tabular-nums',
                  val >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                  {fmt(Math.abs(val))}
                </span>
              </div>
            ))}
          </div>
        )}
      </>)}

      {/* Super fund entities */}
      {superEntities.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm border-b border-border pb-2">Super Fund Entities</h3>
          {superEntities.map(en => (
            <EntitySection key={en.id} entityName={en.name} taxRate={0.15} data={data} entityId={en.id} />
          ))}
        </div>
      )}

      {/* Company / trust entities */}
      {companyEntities.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm border-b border-border pb-2">Company / Trust Entities</h3>
          {companyEntities.map(en => (
            <EntitySection key={en.id} entityName={en.name} taxRate={0.30} data={data} entityId={en.id} />
          ))}
        </div>
      )}

      {/* No data state */}
      {!hasAnyData && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm font-medium">No tax-tracked data found for this FY.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Follow the steps below to tag your data.</p>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-500" />
              How to populate your Tax Report — data tagging checklist
            </h3>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                <div>
                  <p className="font-medium">Income entries — <span className="text-primary">Finance → Income</span></p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Set <strong className="text-foreground">Assigned To</strong> (Mark or Michelle) for personal income; leave blank for joint</li>
                    <li>Tick <strong className="text-foreground">Track for tax</strong> and set <strong className="text-foreground">Tax Classification</strong></li>
                    <li>Name salary entries to contain "Salary" or "Wages" so they appear on the Wages line</li>
                    <li>Mark income as <strong className="text-foreground">Received</strong> to post it to the GL (Actuals column)</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                <div>
                  <p className="font-medium">PAYG withholding — <span className="text-primary">Finance → Transactions</span></p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Set <strong className="text-foreground">Tax Classification</strong> → Tax Payment (PAYG) on each PAYG transaction</li>
                    <li>Set <strong className="text-foreground">Member</strong> → Mark or Michelle</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                <div>
                  <p className="font-medium">Deductions — <span className="text-primary">Finance → Bills</span> or <span className="text-primary">Transactions</span></p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Voluntary super: <strong className="text-foreground">Tax Classification</strong> → Tax Deduction, category name contains "Super"</li>
                    <li>Work expenses, donations: <strong className="text-foreground">Tax Classification</strong> → Tax Deduction</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                <div>
                  <p className="font-medium">Entity types — <span className="text-primary">Finance → Entities</span></p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Super Fund entity → type <strong className="text-foreground">Super Fund</strong> (15% tax)</li>
                    <li>Company → type <strong className="text-foreground">Business</strong> or <strong className="text-foreground">Trust</strong> (30% tax)</li>
                  </ul>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}

      </PrintWrapper>
    </div>
  )
}
