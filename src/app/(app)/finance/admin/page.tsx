'use client'

import { useState } from 'react'
import { ShieldAlert, Play, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHero } from '@/components/shared/PageHero'

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
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Run at {new Date(result.asOf).toLocaleString('en-AU')}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceAdminPage() {
  async function runSpawnNow() {
    const res = await fetch('/api/admin/spawn-now', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Spawn failed')
    return data as SpawnResponse
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
    </div>
  )
}
