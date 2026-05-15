'use client'

import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUPER_CAP } from '@/lib/tax-calculator'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlActualItem {
  journalEntryId: string
  reference: string
  date: string
  description: string
  entryType: string
  amount: number
  side: string
  glAccountId: string
  glAccountName: string
  glAccountType: string
  taxDisplayLabel: string | null
  isTaxDeduction: boolean
  taxIncludeInReporting: boolean
  entityId: string | null
  entityName: string | null
  memberId?: string | null
}

export interface IncomeRow {
  id: string; name: string; amount: number; frequency: string
  estimatedAnnual: number; isTaxTracked: boolean; taxRate: number | null
  taxClassification: string | null
  categoryId: string | null; categoryName: string | null; categoryTaxDisplayLabel: string | null
  entityId: string | null; entityName: string | null
  memberId: string | null; memberName: string | null
}

export interface Member  { id: string; name: string }
export interface Entity  { id: string; name: string; type: string; isDefault: boolean }
export interface TaxCat  { id: string; name: string; displayLabel: string | null; isTaxDeduction: boolean; taxIncludeInReporting: boolean }

export interface ApiResponse {
  financialYear: string; from: string; to: string
  members: Member[]; entities: Entity[]
  glActuals: GlActualItem[]
  incomeEstimates: IncomeRow[]
  transactions: GlActualItem[]
  incomeEntries: IncomeRow[]
  taxCategories: TaxCat[]
  source?: string
}

export interface TaxColumn {
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

export interface PersonTax {
  actuals: TaxColumn
  projected: TaxColumn
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ── Helper sub-components ─────────────────────────────────────────────────────

export function LineRow({ label, amount, color, bold, indent }: {
  label: string; amount: number; color?: string; bold?: boolean; indent?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-0.5 text-sm', indent && 'pl-4')}>
      <span className={cn('text-muted-foreground', bold && 'font-semibold text-foreground')}>{label}</span>
      <span className={cn('tabular-nums font-medium', color ?? 'text-foreground', bold && 'font-bold')}>{fmt(amount)}</span>
    </div>
  )
}

export function Divider() { return <div className="border-t border-border my-1" /> }

export function SectionHeader({ label }: { label: string }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">{label}</p>
}

// ── TaxColumnView ─────────────────────────────────────────────────────────────

export function TaxColumnView({ col, fy, label, isProjected }: {
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

// ── PersonPanel ───────────────────────────────────────────────────────────────

export function PersonPanel({ name, p, fy }: { name: string; p: PersonTax; fy: string }) {
  const hasActuals   = p.actuals.grossIncome > 0 || p.actuals.totalDeductions > 0
  const hasProjected = p.projected.grossIncome > 0

  return (
    <div className="rounded-lg border border-border overflow-hidden flex-1 min-w-0">
      <div className="bg-muted/40 px-4 py-3 border-b border-border">
        <h3 className="font-bold text-base">{name}</h3>
      </div>
      <div className="p-4 space-y-3">
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

// ── EntitySection ─────────────────────────────────────────────────────────────

export function EntitySection({ entityName, taxRate, data, entityId }: {
  entityName: string; taxRate: number; data: ApiResponse; entityId: string
}) {
  const entityGlIncome  = data.glActuals.filter(l =>
    l.entityId === entityId && l.glAccountType === 'income' && l.taxIncludeInReporting && l.amount > 0
  )
  const entityGlExpense = data.glActuals.filter(l =>
    l.entityId === entityId && l.isTaxDeduction && l.amount > 0
  )
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
