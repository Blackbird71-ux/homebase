'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Receipt, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { currentFyYear, fyLabel as fyLabelUtil, fyDateRange } from '@/lib/finance-fy'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'

// ── Australian Tax Brackets 2025-26 ──────────────────────────────────────────
// Update thresholds here each July — no API redeployment needed.
function calcIncomeTax(income: number): number {
  if (income <= 0)       return 0
  if (income <= 18_200)  return 0
  if (income <= 45_000)  return (income - 18_200) * 0.16
  if (income <= 135_000) return 4_288 + (income - 45_000) * 0.30
  if (income <= 190_000) return 31_288 + (income - 135_000) * 0.37
  return 51_638 + (income - 190_000) * 0.45
}

function calcMedicare(income: number): number {
  if (income <= 26_000) return 0
  return income * 0.02
}

function calcPersonalTax(taxableIncome: number): { incomeTax: number; medicare: number; total: number } {
  const incomeTax = Math.round(calcIncomeTax(taxableIncome))
  const medicare  = Math.round(calcMedicare(taxableIncome))
  return { incomeTax, medicare, total: incomeTax + medicare }
}

const SUPER_CAP: Record<string, number> = {
  '2022-23': 27_500,
  '2023-24': 27_500,
  '2024-25': 29_932,
  '2025-26': 30_000,
  '2026-27': 30_000,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TxRow {
  id: string; date: string; description: string | null; amount: number; type: string
  taxClassification: string | null; categoryId: string | null
  categoryName: string | null; categoryTaxDisplayLabel: string | null
  categoryIsTaxDeduction: boolean
  entityId: string | null; entityName: string | null
  memberId: string | null; memberName: string | null
}

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
  transactions: TxRow[]; incomeEntries: IncomeRow[]
  taxCategories: TaxCat[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ── Per-person aggregation ────────────────────────────────────────────────────

interface PersonTax {
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

function buildPersonTax(memberId: string, data: ApiResponse, jointInterestHalf: number): PersonTax {
  const txs = data.transactions.filter(t => t.memberId === memberId)
  const inc = data.incomeEntries.filter(e => e.memberId === memberId)

  const matchLabel = (e: IncomeRow, p: RegExp) =>
    p.test(e.name + ' ' + (e.categoryName ?? '') + ' ' + (e.categoryTaxDisplayLabel ?? ''))
  const matchTxLabel = (t: TxRow, p: RegExp) =>
    p.test((t.categoryName ?? '') + ' ' + (t.categoryTaxDisplayLabel ?? '') + ' ' + (t.description ?? ''))

  const wageEntries        = inc.filter(e => matchLabel(e, /salary|wages/i))
  const frankingEntries    = inc.filter(e => matchLabel(e, /franking|input credit/i))
  const otherIncomeEntries = inc.filter(e => !matchLabel(e, /salary|wages|franking|input credit/i))

  const wages           = wageEntries.reduce((s, e) => s + e.estimatedAnnual, 0)
  const frankingCredits = frankingEntries.reduce((s, e) => s + e.estimatedAnnual, 0)
  const otherIncome     = otherIncomeEntries.reduce((s, e) => s + e.estimatedAnnual, 0)
    + txs.filter(t => t.type === 'income' && (t.taxClassification === 'taxable_income' || t.taxClassification === 'exempt_income')).reduce((s, t) => s + t.amount, 0)
  const grossIncome = wages + jointInterestHalf + otherIncome + frankingCredits

  const voluntarySuper  = txs.filter(t => t.taxClassification === 'tax_deduction' && matchTxLabel(t, /super/i)).reduce((s, t) => s + t.amount, 0)
  const charity         = txs.filter(t => t.taxClassification === 'tax_deduction' && matchTxLabel(t, /charity|gift|donation/i)).reduce((s, t) => s + t.amount, 0)
  const otherDeductions = txs.filter(t => t.taxClassification === 'tax_deduction' && !matchTxLabel(t, /super|charity|gift|donation/i)).reduce((s, t) => s + t.amount, 0)
  const totalDeductions = voluntarySuper + charity + otherDeductions
  const taxableIncome   = Math.max(0, grossIncome - totalDeductions)
  const perWeek         = Math.round(taxableIncome / 52)

  const { incomeTax, medicare, total: totalTaxBeforeFranking } = calcPersonalTax(taxableIncome)
  const totalTaxPayable = Math.max(0, totalTaxBeforeFranking - frankingCredits)

  const paygWithheld    = txs.filter(t => t.taxClassification === 'tax_payment' && matchTxLabel(t, /payg|withh/i)).reduce((s, t) => s + t.amount, 0)
  const paygInstalments = txs.filter(t => t.taxClassification === 'tax_payment' && !matchTxLabel(t, /payg|withh/i)).reduce((s, t) => s + t.amount, 0)
  const totalCredits    = paygWithheld + paygInstalments + frankingCredits
  const refundOrOwing   = totalCredits - totalTaxPayable

  const sgcAmount = data.incomeEntries
    .filter(e => e.memberId === memberId && /sgc|employer.*super/i.test(e.name + ' ' + (e.categoryName ?? '')))
    .reduce((s, e) => s + e.estimatedAnnual, 0)

  const incomeLines: { label: string; amount: number }[] = []
  if (wages > 0)             incomeLines.push({ label: 'Wages / Salary', amount: wages })
  if (jointInterestHalf > 0) incomeLines.push({ label: 'Bank Interest (joint ÷2)', amount: jointInterestHalf })
  otherIncomeEntries.forEach(e => { if (e.estimatedAnnual > 0) incomeLines.push({ label: e.categoryTaxDisplayLabel ?? e.name, amount: e.estimatedAnnual }) })
  if (frankingCredits > 0)   incomeLines.push({ label: 'Franking Credits', amount: frankingCredits })

  const deductionLines: { label: string; amount: number }[] = []
  if (voluntarySuper > 0)  deductionLines.push({ label: 'Voluntary Super', amount: voluntarySuper })
  if (charity > 0)         deductionLines.push({ label: 'Charity / Gifts', amount: charity })
  if (otherDeductions > 0) deductionLines.push({ label: 'Other Deductions', amount: otherDeductions })

  const creditLines: { label: string; amount: number }[] = []
  if (paygWithheld > 0)    creditLines.push({ label: 'PAYG Withheld', amount: paygWithheld })
  if (paygInstalments > 0) creditLines.push({ label: 'PAYG Instalments', amount: paygInstalments })
  if (frankingCredits > 0) creditLines.push({ label: 'Franking Credit Offset', amount: frankingCredits })

  return {
    wages, bankInterest: jointInterestHalf, otherIncome, frankingCredits, grossIncome,
    voluntarySuper, charity, otherDeductions, totalDeductions, taxableIncome, perWeek,
    incomeTax, medicare, totalTaxPayable, paygWithheld, paygInstalments,
    frankingOffset: frankingCredits, totalCredits, refundOrOwing,
    sgcAmount, voluntarySuperForCap: voluntarySuper,
    incomeLines, deductionLines, creditLines,
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LineRow({ label, amount, color, bold, indent }: { label: string; amount: number; color?: string; bold?: boolean; indent?: boolean }) {
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

function PersonPanel({ name, p, fy }: { name: string; p: PersonTax; fy: string }) {
  const cap = SUPER_CAP[fy] ?? 30_000
  const totalSuper   = p.sgcAmount + p.voluntarySuperForCap
  const superPct     = Math.min(100, Math.round((totalSuper / cap) * 100))
  const superExceeds = totalSuper > cap
  const isRefund     = p.refundOrOwing >= 0

  return (
    <div className="rounded-lg border border-border p-4 space-y-0.5 flex-1 min-w-0">
      <h3 className="font-bold text-base mb-2">{name}</h3>
      <SectionHeader label="Gross Income" />
      {p.incomeLines.map(l => <LineRow key={l.label} label={l.label} amount={l.amount} indent />)}
      <Divider />
      <LineRow label="Total Gross Income" amount={p.grossIncome} bold color="text-green-600 dark:text-green-400" />

      {p.totalDeductions > 0 && (<>
        <SectionHeader label="Deductions" />
        {p.deductionLines.map(l => <LineRow key={l.label} label={l.label} amount={l.amount} indent />)}
        <Divider />
        <LineRow label="Total Deductions" amount={p.totalDeductions} bold color="text-red-600 dark:text-red-400" />
      </>)}

      <Divider />
      <LineRow label="Total Taxable Income" amount={p.taxableIncome} bold />
      <div className="flex items-center justify-between text-xs text-muted-foreground pl-4">
        <span>Per week</span><span className="tabular-nums">{fmt(p.perWeek)}</span>
      </div>

      <SectionHeader label="Tax Calculation" />
      <LineRow label="Income tax (brackets)" amount={p.incomeTax} indent />
      <LineRow label="Medicare levy (2%)" amount={p.medicare} indent />
      {p.frankingOffset > 0 && <LineRow label="Less: Franking credits" amount={-p.frankingOffset} indent color="text-green-600 dark:text-green-400" />}
      <Divider />
      <LineRow label="Tax Payable" amount={p.totalTaxPayable} bold color="text-orange-600 dark:text-orange-400" />

      <SectionHeader label="Tax Already Paid" />
      {p.creditLines.length > 0
        ? p.creditLines.map(l => <LineRow key={l.label} label={l.label} amount={l.amount} indent color="text-green-600 dark:text-green-400" />)
        : <p className="text-xs text-muted-foreground pl-4">No credits recorded</p>}
      <Divider />
      <LineRow label="Total Credits" amount={p.totalCredits} bold color="text-green-600 dark:text-green-400" />

      <div className={cn('mt-3 rounded-md p-3 flex items-center justify-between',
        isRefund ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30')}>
        <span className={cn('text-sm font-bold', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
          {isRefund ? '← REFUND' : 'OWING →'}
        </span>
        <span className={cn('text-lg font-bold tabular-nums', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
          {fmt(Math.abs(p.refundOrOwing))}
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
        {p.sgcAmount > 0 && <div className="flex justify-between text-xs text-muted-foreground pl-3"><span>SGC (employer)</span><span>{fmt(p.sgcAmount)}</span></div>}
        {p.voluntarySuperForCap > 0 && <div className="flex justify-between text-xs text-muted-foreground pl-3"><span>Voluntary</span><span>{fmt(p.voluntarySuperForCap)}</span></div>}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full', superExceeds ? 'bg-red-500' : superPct >= 90 ? 'bg-amber-500' : 'bg-green-500')}
            style={{ width: `${superPct}%` }} />
        </div>
        {superExceeds
          ? <p className="text-[10px] text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Exceeds cap by {fmt(totalSuper - cap)}</p>
          : <p className="text-[10px] text-muted-foreground">{fmt(cap - totalSuper)} remaining</p>}
      </div>
    </div>
  )
}

function EntitySection({ entityName, taxRate, data, entityId }: { entityName: string; taxRate: number; data: ApiResponse; entityId: string }) {
  const incomeEntries = data.incomeEntries.filter(e => e.entityId === entityId)
  const txExpenses    = data.transactions.filter(t => t.entityId === entityId && t.type === 'expense' && t.taxClassification !== 'tax_payment')
  const txPayments    = data.transactions.filter(t => t.entityId === entityId && t.taxClassification === 'tax_payment')
  const totalIncome   = incomeEntries.reduce((s, e) => s + e.estimatedAnnual, 0)
  const totalExpenses = txExpenses.reduce((s, t) => s + t.amount, 0)
  const taxableIncome = Math.max(0, totalIncome - totalExpenses)
  const taxPayable    = Math.round(taxableIncome * taxRate)
  const paygPaid      = txPayments.reduce((s, t) => s + t.amount, 0)
  const owing         = taxPayable - paygPaid
  const quarterly     = Math.round(taxPayable / 4)
  if (totalIncome === 0 && totalExpenses === 0) return null
  const isRefund = owing <= 0
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{entityName}</h3>
        <span className="text-xs text-muted-foreground">{taxRate * 100}% tax rate</span>
      </div>
      <div className="p-4 space-y-0.5">
        <SectionHeader label="Income" />
        {incomeEntries.map(e => <LineRow key={e.id} label={e.categoryTaxDisplayLabel ?? e.name} amount={e.estimatedAnnual} indent />)}
        <Divider />
        <LineRow label="Total Income" amount={totalIncome} bold color="text-green-600 dark:text-green-400" />
        {totalExpenses > 0 && (<>
          <SectionHeader label="Operating Expenses" />
          {txExpenses.map(t => <LineRow key={t.id} label={t.categoryTaxDisplayLabel ?? t.categoryName ?? t.description ?? 'Expense'} amount={t.amount} indent />)}
          <Divider />
          <LineRow label="Total Expenses" amount={totalExpenses} bold color="text-red-600 dark:text-red-400" />
        </>)}
        <Divider />
        <LineRow label="Taxable Income" amount={taxableIncome} bold />
        <LineRow label={`Tax @ ${taxRate * 100}%`} amount={taxPayable} color="text-orange-600 dark:text-orange-400" />
        {paygPaid > 0 && <LineRow label="Less: PAYG Instalments Paid" amount={paygPaid} color="text-green-600 dark:text-green-400" />}
        <div className={cn('mt-3 rounded-md p-3 flex items-center justify-between',
          isRefund ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30')}>
          <span className={cn('text-sm font-bold', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {isRefund ? '← REFUND' : 'OWING →'}
          </span>
          <span className={cn('text-lg font-bold tabular-nums', isRefund ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
            {fmt(Math.abs(owing))}
          </span>
        </div>
        {quarterly > 0 && <p className="text-xs text-muted-foreground mt-2">Quarterly BAS instalment estimate: <strong>{fmt(quarterly)}</strong></p>}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TaxReportPage() {
  const [data, setData]             = useState<ApiResponse | null>(null)
  const [loading, setLoading]       = useState(true)
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [fyStartYear, setFyStartYear]   = useState<number>(() => currentFyYear(7))
  const printRef = useRef<HTMLDivElement>(null)

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
        // Pass FY date range
        const { start, end } = fyDateRange(fyStartYear, fyStartMonth)
        params.set('from', start.toISOString().split('T')[0])
        params.set('to', end.toISOString().split('T')[0])
        const res = await fetch(`/api/finance/tax-report?${params}`)
        if (!res.ok) { toast.error('Failed to load tax report'); return }
        setData(await res.json())
      } catch { toast.error('Failed to load tax report') }
      finally { setLoading(false) }
    }
    load()
  }, [entityFilter, fyStartYear, fyStartMonth])

  const jointIncome = useMemo(() => {
    if (!data) return 0
    const defaultEntityIds = new Set(data.entities.filter(e => e.isDefault).map(e => e.id))
    return data.incomeEntries
      .filter(e => !e.memberId && (!e.entityId || defaultEntityIds.has(e.entityId)))
      .reduce((s, e) => s + e.estimatedAnnual, 0)
      + data.transactions
      .filter(t => t.type === 'income' && !t.memberId && (!t.entityId || defaultEntityIds.has(t.entityId)))
      .reduce((s, t) => s + t.amount, 0)
  }, [data])

  const jointPerPerson = jointIncome / Math.max(1, data?.members.length ?? 1)

  const personData = useMemo(() => {
    if (!data) return []
    return data.members.map(m => ({ member: m, tax: buildPersonTax(m.id, data, jointPerPerson) }))
  }, [data, jointPerPerson])

  const combinedRefund  = personData.reduce((s, p) => s + p.tax.refundOrOwing, 0)
  const superEntities   = data?.entities.filter(e => e.type === 'superfund') ?? []
  const companyEntities = data?.entities.filter(e => e.type === 'business' || e.type === 'trust') ?? []
  const fy = data?.financialYear ?? '2025-26'
  const hasAnyData = personData.length > 0 || superEntities.length > 0 || companyEntities.length > 0

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Loading tax report…</div>
  if (!data)   return null

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-500" /> Tax Report
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5">
              <button onClick={() => setFyStartYear(y => y - 1)} className="p-0.5 hover:bg-accent rounded text-muted-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-semibold px-1 min-w-[70px] text-center">{fyLabelUtil(fyStartYear, fyStartMonth)}</span>
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
        <PrintButton
          printRef={printRef}
          reportTitle="Tax Report"
          dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
          disabled={loading}
        />
      </div>

      {/* ── Printable region ──────────────────────────────────────────────── */}
      <PrintWrapper
        ref={printRef}
        reportTitle="Tax Report"
        dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
        meta={`${data?.from ?? ''} – ${data?.to ?? ''} · Estimated only — consult your accountant`}
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

      {/* Joint income */}
      {jointIncome > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="font-semibold text-sm mb-2">Joint Income</h3>
          {data.incomeEntries
            .filter(e => !e.memberId && (!e.entityId || data.entities.find(en => en.id === e.entityId)?.isDefault))
            .map(e => <LineRow key={e.id} label={e.categoryTaxDisplayLabel ?? e.name} amount={e.estimatedAnnual} />)}
          <Divider />
          <LineRow label="Total Joint Income" amount={jointIncome} bold color="text-green-600 dark:text-green-400" />
          {data.members.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              Split equally: {data.members.map(m => `${m.name} ${fmt(jointPerPerson)}`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Per-person panels */}
      {personData.length > 0 && (<>
        <div className="flex gap-4 flex-wrap lg:flex-nowrap">
          {personData.map(({ member, tax }) => <PersonPanel key={member.id} name={member.name} p={tax} fy={fy} />)}
        </div>
        {personData.length > 1 && (
          <div className={cn('rounded-lg border p-4 flex items-center justify-between',
            combinedRefund >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
            <span className={cn('font-bold', combinedRefund >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
              Combined {combinedRefund >= 0 ? 'Refund' : 'Owing'}
            </span>
            <span className={cn('text-2xl font-bold tabular-nums', combinedRefund >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
              {fmt(Math.abs(combinedRefund))}
            </span>
          </div>
        )}
      </>)}

      {/* Super fund entities */}
      {superEntities.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm border-b border-border pb-2">Super Fund Entities</h3>
          {superEntities.map(en => <EntitySection key={en.id} entityName={en.name} taxRate={0.15} data={data} entityId={en.id} />)}
        </div>
      )}

      {/* Company / trust entities */}
      {companyEntities.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm border-b border-border pb-2">Company / Trust Entities</h3>
          {companyEntities.map(en => <EntitySection key={en.id} entityName={en.name} taxRate={0.30} data={data} entityId={en.id} />)}
        </div>
      )}

      {/* No data state — full tagging guide */}
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
                    <li>Open each entry, set <strong className="text-foreground">Assigned To</strong> (Mark or Michelle) for personal income; leave blank for joint (bank interest)</li>
                    <li>Tick <strong className="text-foreground">Track for tax</strong> and set <strong className="text-foreground">Tax Classification</strong> → Taxable Income or Exempt Income</li>
                    <li>Name salary entries to contain "Salary" or "Wages" so they appear on the Wages line</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                <div>
                  <p className="font-medium">PAYG withholding — <span className="text-primary">Finance → Transactions</span></p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Set <strong className="text-foreground">Tax Classification</strong> → Tax Payment (PAYG) on each PAYG transaction</li>
                    <li>Set <strong className="text-foreground">Member</strong> → Mark or Michelle so it credits the right person</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                <div>
                  <p className="font-medium">Deductions — <span className="text-primary">Finance → Bills</span> or <span className="text-primary">Transactions</span></p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Voluntary super: <strong className="text-foreground">Tax Classification</strong> → Tax Deduction, and category name contains "Super"</li>
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
                    <li>Unitrak / company → type <strong className="text-foreground">Business</strong> or <strong className="text-foreground">Trust</strong> (30% tax)</li>
                  </ul>
                </div>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground border-t border-amber-500/20 pt-3">
              Once tagged, reload this page. The Tax Report automatically reads the current financial year (1 Jul – 30 Jun).
            </p>
          </div>
        </div>
      )}

      </PrintWrapper>
    </div>
  )
}
