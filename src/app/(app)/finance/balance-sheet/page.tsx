'use client'

import { useEffect, useState } from 'react'
import { Building2, TrendingUp, TrendingDown, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface BankRow {
  id: string; name: string; accountType: string; institution: string | null
  currency: string; creditLimit: number | null; color: string | null
  icon: string | null; balance: number; source: 'bank_account'
}

interface COARow {
  id: string; name: string; glCode: string | null; type: string
  parentId: string | null; parentName: string | null
  openingBalance: number; openingBalanceDate: string | null
  isSystem: boolean; source: 'coa'
}

interface AssetSection {
  bankAccounts:       BankRow[]
  accountsReceivable: number
  coaAccounts:        COARow[]
  totalBank:          number
  totalAR:            number
  totalCOA:           number
  total:              number
}

interface LiabilitySection {
  bankAccounts:      BankRow[]
  overdraftAccounts: BankRow[]
  accountsPayable:   number
  coaAccounts:       COARow[]
  totalBank:         number
  totalOverdraft:    number
  totalAP:           number
  totalCOA:          number
  total:             number
}

interface EquitySection {
  coaAccounts:           COARow[]
  staticTotal:           number
  currentPeriodNetIncome: number
  total:                 number
}

interface BalanceSheetResponse {
  asAt:       string
  assets:     AssetSection
  liabilities: LiabilitySection
  equity:     EquitySection
  netWorth:   number
  equityMatchesNetWorth: boolean
}

interface Entity { id: string; name: string; type: string; isDefault: boolean; color: string | null }

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function SectionRow({ label, amount, indent, bold, glCode, muted, positive }: {
  label: string; amount: number; indent?: boolean; bold?: boolean
  glCode?: string | null; muted?: boolean; positive?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1 text-sm', indent && 'pl-4')}>
      <span className={cn(
        'flex items-center gap-2',
        bold ? 'font-semibold text-foreground' : muted ? 'text-muted-foreground/70 italic' : 'text-muted-foreground',
      )}>
        {glCode && (
          <span className="text-[10px] font-mono bg-muted px-1 rounded text-muted-foreground/70">
            {glCode}
          </span>
        )}
        {label}
      </span>
      <span className={cn(
        'tabular-nums font-medium',
        bold && 'font-bold',
        muted && 'text-muted-foreground/70',
        positive !== undefined && (positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'),
      )}>
        {fmt(amount)}
      </span>
    </div>
  )
}

function Divider() { return <div className="border-t border-border my-1" /> }

function SectionHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-2">
      {icon}
      <h2 className="text-base font-bold">{label}</h2>
    </div>
  )
}

function SubHeading({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">
      {label}
    </p>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const [data, setData]         = useState<BalanceSheetResponse | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityId, setEntityId] = useState('')
  const [asAt, setAsAt]         = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/finance/entities')
      .then(r => r.ok ? r.json() : [])
      .then(setEntities)
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ asAt })
        if (entityId) params.set('entityId', entityId)
        const res = await fetch(`/api/finance/balance-sheet?${params}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    }
    load()
  }, [asAt, entityId])

  if (loading && !data) {
    return <div className="p-4 text-muted-foreground text-sm">Loading balance sheet…</div>
  }
  if (!data) return null

  const hasEquityEntries   = data.equity.coaAccounts.length > 0 || data.equity.currentPeriodNetIncome !== 0
  const hasCOAAssets       = data.assets.coaAccounts.length > 0
  const hasCOALiabilities  = data.liabilities.coaAccounts.length > 0
  const hasAP              = data.liabilities.accountsPayable > 0
  const hasAR              = data.assets.accountsReceivable > 0
  const showSetupGuide     = !hasCOAAssets && !hasCOALiabilities && !data.equity.coaAccounts.length && !hasAP && !hasAR

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Balance Sheet
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            What you own minus what you owe = your net worth.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground mr-1">As at</label>
            <input
              type="date"
              value={asAt}
              onChange={e => setAsAt(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Entity filter */}
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setEntityId('')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              !entityId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            All
          </button>
          {entities.map(en => (
            <button
              key={en.id}
              onClick={() => setEntityId(entityId === en.id ? '' : en.id)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                entityId === en.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {en.name}
            </button>
          ))}
        </div>
      )}

      {/* Setup guide */}
      {showSetupGuide && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Set up your Balance Sheet
          </h3>
          <p className="text-sm text-muted-foreground">
            Your bank account balances are shown below. To complete the Balance Sheet with
            property, investments, mortgages, and other assets/liabilities:
          </p>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>
              Go to <strong className="text-foreground">Chart of Accounts</strong> and create
              accounts with type <strong className="text-foreground">Asset</strong>,{' '}
              <strong className="text-foreground">Liability</strong>, or{' '}
              <strong className="text-foreground">Equity</strong>.
            </li>
            <li>
              Click <strong className="text-foreground">Set OB</strong> on each account to enter
              its opening balance and as-at date.
            </li>
            <li>
              Return here — the Balance Sheet populates automatically. Bills with a received
              invoice also appear under Accounts Payable automatically.
            </li>
          </ol>
        </div>
      )}

      {/* ── ASSETS ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 space-y-1">
        <SectionHeader label="ASSETS" icon={<TrendingUp className="h-4 w-4 text-green-500" />} />

        {/* Bank accounts with positive balance */}
        {data.assets.bankAccounts.length > 0 && (
          <>
            <SubHeading label="Bank & Cash Accounts" />
            {data.assets.bankAccounts.map(a => (
              <SectionRow
                key={a.id}
                label={a.institution ? `${a.name} (${a.institution})` : a.name}
                amount={a.balance}
                indent
              />
            ))}
            {(hasAR || hasCOAAssets) && (
              <SectionRow label="Subtotal — Bank & Cash" amount={data.assets.totalBank} bold />
            )}
          </>
        )}

        {/* Accounts Receivable (uncleared income with invoice received) */}
        {hasAR && (
          <>
            <SubHeading label="Accounts Receivable" />
            <SectionRow
              label="Invoiced income not yet received"
              amount={data.assets.accountsReceivable}
              indent
              muted
            />
          </>
        )}

        {/* COA asset accounts */}
        {hasCOAAssets && (
          <>
            <SubHeading label="Other Assets" />
            {data.assets.coaAccounts.map(c => (
              <SectionRow
                key={c.id}
                label={c.parentName ? `${c.parentName} — ${c.name}` : c.name}
                amount={c.openingBalance}
                glCode={c.glCode}
                indent
              />
            ))}
          </>
        )}

        <Divider />
        <SectionRow label="TOTAL ASSETS" amount={data.assets.total} bold />
      </div>

      {/* ── LIABILITIES ───────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 space-y-1">
        <SectionHeader label="LIABILITIES" icon={<TrendingDown className="h-4 w-4 text-red-500" />} />

        {/* Credit cards / loans */}
        {data.liabilities.bankAccounts.length > 0 && (
          <>
            <SubHeading label="Credit Cards & Loans" />
            {data.liabilities.bankAccounts.map(a => (
              <SectionRow
                key={a.id}
                label={a.institution ? `${a.name} (${a.institution})` : a.name}
                amount={Math.max(0, a.balance)}
                indent
              />
            ))}
          </>
        )}

        {/* Overdrawn accounts */}
        {data.liabilities.overdraftAccounts.length > 0 && (
          <>
            <SubHeading label="Overdrawn Accounts" />
            {data.liabilities.overdraftAccounts.map(a => (
              <SectionRow
                key={a.id}
                label={`${a.institution ? `${a.name} (${a.institution})` : a.name} — overdrawn`}
                amount={Math.abs(a.balance)}
                indent
              />
            ))}
          </>
        )}

        {/* Accounts Payable (bills with invoice received but not paid) */}
        {hasAP && (
          <>
            <SubHeading label="Accounts Payable" />
            <SectionRow
              label="Invoices received but not yet paid"
              amount={data.liabilities.accountsPayable}
              indent
              muted
            />
          </>
        )}

        {/* COA liability accounts */}
        {hasCOALiabilities && (
          <>
            <SubHeading label="Other Liabilities" />
            {data.liabilities.coaAccounts.map(c => (
              <SectionRow
                key={c.id}
                label={c.parentName ? `${c.parentName} — ${c.name}` : c.name}
                amount={c.openingBalance}
                glCode={c.glCode}
                indent
              />
            ))}
          </>
        )}

        {data.assets.total === 0 && data.liabilities.total === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No liabilities recorded yet.
          </p>
        )}

        <Divider />
        <SectionRow label="TOTAL LIABILITIES" amount={data.liabilities.total} bold />
      </div>

      {/* ── EQUITY ────────────────────────────────────────────────────────── */}
      {hasEquityEntries && (
        <div className="rounded-lg border border-border p-4 space-y-1">
          <SectionHeader label="EQUITY" icon={<Wallet className="h-4 w-4 text-purple-500" />} />

          {/* Static COA equity accounts (owner investments, share capital, etc.) */}
          {data.equity.coaAccounts.length > 0 && (
            <>
              <SubHeading label="Owner Equity / Capital" />
              {data.equity.coaAccounts.map(c => (
                <SectionRow
                  key={c.id}
                  label={c.name}
                  amount={c.openingBalance}
                  glCode={c.glCode}
                  indent
                />
              ))}
            </>
          )}

          {/* Current period net income — retained earnings (P0 fix #2) */}
          <SubHeading label="Retained Earnings / Current Period" />
          <SectionRow
            label="Net Income to date"
            amount={data.equity.currentPeriodNetIncome}
            indent
            positive={data.equity.currentPeriodNetIncome >= 0}
          />

          <Divider />
          <SectionRow label="TOTAL EQUITY" amount={data.equity.total} bold />
        </div>
      )}

      {/* ── NET WORTH ─────────────────────────────────────────────────────── */}
      <div className={cn(
        'rounded-lg border-2 p-5 flex items-center justify-between',
        data.netWorth >= 0
          ? 'border-green-500/40 bg-green-500/5'
          : 'border-red-500/40 bg-red-500/5',
      )}>
        <div>
          <p className={cn(
            'text-lg font-bold',
            data.netWorth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}>
            NET WORTH
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Total Assets ({fmt(data.assets.total)}) − Total Liabilities ({fmt(data.liabilities.total)})
          </p>
        </div>
        <p className={cn(
          'text-3xl font-bold tabular-nums',
          data.netWorth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
        )}>
          {fmt(data.netWorth)}
        </p>
      </div>

      {/* Accounting equation status */}
      {hasEquityEntries && (
        <div className={cn(
          'rounded-md px-3 py-2 text-xs flex items-start gap-2',
          data.equityMatchesNetWorth
            ? 'bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400',
        )}>
          {data.equityMatchesNetWorth
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          }
          <span>
            {data.equityMatchesNetWorth
              ? `Accounting equation checks out: Equity (${fmt(data.equity.total)}) = Net Worth (${fmt(data.netWorth)}) ✓`
              : `Equity (${fmt(data.equity.total)}) does not yet equal Net Worth (${fmt(data.netWorth)}). ` +
                `Add opening balances for your equity accounts in Chart of Accounts to complete the equation.`
            }
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Bank balances are derived from cleared transactions and posted journal entries.
        Accounts Payable shows bills with invoice received but not yet paid.
        Accounts Receivable shows income with remittance received but not yet in your bank.
        Net Income is calculated from all cleared income and expense transactions plus posted journal adjustments.
        Property, investments, and mortgages use opening balances from Chart of Accounts — update these manually when values change.
      </p>
    </div>
  )
}
