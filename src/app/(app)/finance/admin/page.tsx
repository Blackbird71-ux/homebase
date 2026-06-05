'use client'

import { useState } from 'react'
import { ShieldAlert, Play, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHero } from '@/components/shared/PageHero'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { formatInTz } from '@/lib/timezone'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SpawnResult {
  familyId: string
  templatesConsidered?: number
  totalSpawned?: number
  disabled?: number
  ok: boolean
  error?: string
}

interface SpawnResponse {
  asOf: string
  results: SpawnResult[]
}

interface IntegrityFinding {
  severity: 'critical' | 'warning' | 'info'
  code: string
  recordType: string
  recordId: string
  label: string
  message: string
}

interface IntegrityCheck {
  code: string
  label: string
  status: 'pass' | 'fail'
  findingCount: number
}

interface IntegrityResponse {
  ranAt: string
  familyId: string
  asAt: string
  checks: IntegrityCheck[]
  findings: IntegrityFinding[]
  summary: { critical: number; warning: number; info: number; passed: number; failed: number }
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({
  title,
  description,
  buttonLabel,
  onRun,
  renderResult,
}: {
  title: string
  description: string
  buttonLabel: string
  onRun: () => Promise<unknown>
  renderResult: (result: unknown) => React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  async function handleRun() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const r = await onRun()
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <button
          onClick={handleRun}
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 ml-4"
        >
          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {busy ? 'Running…' : buttonLabel}
        </button>
      </div>

      {(result !== null || error) && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(p => !p)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/20"
          >
            <span>Result</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {expanded && (
            <div className="px-4 pb-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              {result !== null && renderResult(result)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Spawn result renderer ─────────────────────────────────────────────────────

function SpawnResultView({ result }: { result: SpawnResponse }) {
  const timezone = useFamilyTimezone()
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Run at {formatInTz(new Date(result.asOf), timezone, { dateStyle: 'medium', timeStyle: 'medium' })}
      </p>
      {result.results.map((r) => (
        <div
          key={r.familyId}
          className={cn(
            'flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm',
            r.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'
          )}
        >
          {r.ok
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          }
          <div className="flex-1 min-w-0">
            {r.ok ? (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span>
                  <span className="font-medium">{r.totalSpawned}</span>
                  <span className="text-muted-foreground"> drafted</span>
                </span>
                <span>
                  <span className="font-medium">{r.templatesConsidered}</span>
                  <span className="text-muted-foreground"> templates considered</span>
                </span>
                {(r.disabled ?? 0) > 0 && (
                  <span className="text-amber-600">
                    <span className="font-medium">{r.disabled}</span> auto-disabled
                  </span>
                )}
              </div>
            ) : (
              <span className="text-destructive">{r.error}</span>
            )}
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{r.familyId}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Integrity result renderer ──────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: IntegrityFinding['severity'] }) {
  const map = {
    critical: { cls: 'bg-destructive/10 text-destructive border-destructive/30', Icon: XCircle },
    warning:  { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30', Icon: AlertTriangle },
    info:     { cls: 'bg-sky-500/10 text-sky-600 border-sky-500/30', Icon: Info },
  }[severity]
  const { cls, Icon } = map
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', cls)}>
      <Icon className="h-3 w-3" />
      {severity}
    </span>
  )
}

function IntegrityResultView({ result }: { result: IntegrityResponse }) {
  const timezone = useFamilyTimezone()
  const { summary, checks, findings } = result
  const clean = summary.critical === 0 && summary.failed === 0

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Run at {formatInTz(new Date(result.ranAt), timezone, { dateStyle: 'medium', timeStyle: 'medium' })} · as at {formatInTz(new Date(result.asAt), timezone, { dateStyle: 'medium' })}
      </p>

      {/* Summary line */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1">
          <span className="font-semibold">{summary.critical}</span> <span className="text-muted-foreground">critical</span>
        </span>
        <span className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1">
          <span className="font-semibold">{summary.warning}</span> <span className="text-muted-foreground">warning</span>
        </span>
        <span className="rounded-md border border-sky-500/30 bg-sky-500/5 px-2.5 py-1">
          <span className="font-semibold">{summary.info}</span> <span className="text-muted-foreground">info</span>
        </span>
        <span className="rounded-md border border-border bg-muted/20 px-2.5 py-1">
          <span className="font-semibold">{summary.passed}</span>/<span className="font-semibold">{summary.passed + summary.failed}</span> <span className="text-muted-foreground">checks passed</span>
        </span>
      </div>

      {clean && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          All integrity checks passed — every row reconciles with the GL.
        </div>
      )}

      {/* Checks list */}
      <div className="rounded-md border border-border divide-y divide-border">
        {checks.map((c) => (
          <div key={c.code} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              {c.status === 'pass'
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
              <span className="truncate">{c.label}</span>
            </span>
            {c.findingCount > 0 && (
              <span className={cn('shrink-0 text-xs', c.status === 'fail' ? 'text-destructive' : 'text-muted-foreground')}>
                {c.findingCount} {c.findingCount === 1 ? 'finding' : 'findings'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Findings detail */}
      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Findings</p>
          {findings.map((f, i) => (
            <div key={`${f.code}-${f.recordId}-${i}`} className="rounded-md border border-border bg-card px-3 py-2.5 text-sm space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={f.severity} />
                <span className="text-xs text-muted-foreground">{f.recordType}</span>
                <span className="font-medium truncate">{f.label}</span>
              </div>
              <p className="text-muted-foreground">{f.message}</p>
              <p className="text-[11px] text-muted-foreground/70 font-mono truncate">{f.code} · {f.recordId}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceAdminPage() {
  async function runSpawnNow() {
    const res = await fetch('/api/admin/spawn-now', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Spawn failed')
    return data as SpawnResponse
  }

  async function runIntegrityAudit() {
    const res = await fetch('/api/finance/integrity')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Audit failed')
    return data as IntegrityResponse
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <PageHero title="Finance Admin" subtitle="Administrative tools — visible to admins only." />

      {/* Scheduler section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Scheduler</h2>

        <ActionCard
          title="Run Spawn Now"
          description="Immediately runs the draft-spawn worker for all families. The same job the daily 06:00 AEST cron runs. Safe to run multiple times — idempotent."
          buttonLabel="Run Spawn"
          onRun={runSpawnNow}
          renderResult={(r) => <SpawnResultView result={r as SpawnResponse} />}
        />
      </section>

      {/* Integrity section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Integrity</h2>

        <ActionCard
          title="Run Integrity Audit"
          description="Read-only check that every bill, income, payslip and transaction reconciles with the posted General Ledger. Catches row↔GL divergence (wrong accrual account, missing payment journal, AP/AR drift). Makes no changes — safe to run any time."
          buttonLabel="Run Audit"
          onRun={runIntegrityAudit}
          renderResult={(r) => <IntegrityResultView result={r as IntegrityResponse} />}
        />
      </section>
    </div>
  )
}
