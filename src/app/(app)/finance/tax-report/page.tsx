'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Receipt, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { currentFyYear, fyLabel as fyLabelUtil } from '@/lib/finance-fy'
import { calcPersonalTax } from '@/lib/tax-calculator'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'
import { ExcelButton } from '@/components/print/ExcelButton'
import { buildTaxReportWorkbook } from '@/lib/excel/tax-report-excel'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import {
  type GlActualItem, type IncomeRow, type Member, type Entity, type TaxCat,
  type ApiResponse, type TaxColumn, type PersonTax,
  fmt, LineRow, TaxColumnView, PersonPanel, EntitySection,
} from '@/components/finance/TaxReportComponents'

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
  const glTaxLines  = memberGlLines.filter(l => l.taxClassification === 'tax_payment')
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TaxReportPage() {
  const [data, setData]                 = useState<ApiResponse | null>(null)
  const [loading, setLoading]           = useState(true)
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [fyStartYear, setFyStartYear]   = useState<number>(() => currentFyYear(7))
  const printRef = useRef<HTMLDivElement>(null)
  const familyTimezone = useFamilyTimezone()

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
        // Send the FY's true calendar boundaries as YYYY-MM-DD. Deriving these from a
        // Date via toISOString() shifts the day for east-of-UTC zones (Sydney 1 Jul
        // midnight serialises to 30 Jun in UTC); the route reads these strings in the
        // family timezone, so they must be the real calendar dates.
        const endMonth1 = fyStartMonth === 1 ? 12 : fyStartMonth - 1
        const endYear   = fyStartMonth === 1 ? fyStartYear : fyStartYear + 1
        const lastDay   = new Date(endYear, endMonth1, 0).getDate()
        params.set('from', `${fyStartYear}-${String(fyStartMonth).padStart(2, '0')}-01`)
        params.set('to',   `${endYear}-${String(endMonth1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`)
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
      <header className="hb-page-head">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="hb-page-head__title">Tax Report</h1>
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
          <p className="hb-page-head__sub">{data.from} – {data.to} · Estimated only — consult your accountant for final figures.</p>
        </div>
        <div className="hb-page-head__actions">
          <PrintButton
            printRef={printRef}
            reportTitle="Tax Report"
            dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
            disabled={loading}
          />
          <ExcelButton
            buildWorkbook={() => buildTaxReportWorkbook({
              fyStr: fyLabelUtil(fyStartYear, fyStartMonth),
              financialYear: data?.financialYear ?? '2025-26',
              personData,
              timezone: familyTimezone,
            })}
            filename={`HomeBase - Tax Report - ${fyLabelUtil(fyStartYear, fyStartMonth)}.xlsx`}
            disabled={loading}
          />
        </div>
      </header>

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
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Actuals</p>
                <LineRow label="Total Joint Income" amount={jointActualsIncome} bold color="text-green-600 dark:text-green-400" />
              </div>
            )}
            {jointProjectedIncome > 0 && (
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Projected</p>
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
