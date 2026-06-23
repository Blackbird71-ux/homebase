'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ShieldAlert, Play, RefreshCw, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Terminal, Trash2, Pause, CirclePlay,
  Container, Users, Plus, Copy, Check, KeyRound, ChevronRight,
  Info, Network, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
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

interface WarmResponse {
  asOf: string
  total: number
  attempted: number
  cached: number
  failed: number
  remaining: number
}

interface LogLine {
  ts: string
  level: 'log' | 'info' | 'warn' | 'error'
  msg: string
}

interface FamilyRow {
  id: string
  name: string
  memberCount: number
}

interface FamilyUser {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
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

// ── Warm-cache result renderer ────────────────────────────────────────────────

function WarmResultView({ result }: { result: WarmResponse }) {
  const timezone = useFamilyTimezone()
  const allDone = result.remaining === 0
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Run at {formatInTz(new Date(result.asOf), timezone, { dateStyle: 'medium', timeStyle: 'medium' })}
      </p>
      <div
        className={cn(
          'flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm',
          result.failed > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'
        )}
      >
        {result.failed > 0
          ? <XCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span><span className="font-medium">{result.cached}</span><span className="text-muted-foreground"> cached</span></span>
            {result.failed > 0 && (
              <span className="text-amber-600"><span className="font-medium">{result.failed}</span> failed</span>
            )}
            <span><span className="font-medium">{result.attempted}</span><span className="text-muted-foreground"> attempted</span></span>
            <span><span className="font-medium">{result.remaining}</span><span className="text-muted-foreground"> remaining</span></span>
          </div>
          <p className="text-xs text-muted-foreground">
            {allDone
              ? 'All recipe images are cached.'
              : `${result.remaining} image(s) still uncached — run again to continue.`}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Log Viewer ────────────────────────────────────────────────────────────────

const AUTO_SCROLL_THRESHOLD = 50

const LEVEL_STYLES: Record<LogLine['level'], string> = {
  log:   'text-slate-300',
  info:  'text-blue-400',
  warn:  'text-amber-400',
  error: 'text-red-400',
}

type LevelFilter = 'errors' | 'all'

function LogViewer() {
  const timezone = useFamilyTimezone()
  const [lines, setLines] = useState<LogLine[]>([])
  const [polling, setPolling] = useState(false)
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('errors')
  const [error, setError] = useState('')
  const [pinned, setPinned] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isNearBottom = useRef(true)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/logs?n=500')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { lines: LogLine[] }
      setLines(data.lines)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (polling) {
      intervalRef.current = setInterval(fetchLogs, 3000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [polling, fetchLogs])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < AUTO_SCROLL_THRESHOLD
      isNearBottom.current = near
      setPinned(near)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!polling) return
    if (!isNearBottom.current) return
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines, polling])

  async function clearLogs() {
    await fetch('/api/admin/logs', { method: 'DELETE' })
    setLines([])
  }

  const visible = levelFilter === 'errors'
    ? lines.filter(l => l.level === 'error' || l.level === 'warn')
    : lines

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <div>
            <p className="font-semibold text-sm">Server Logs</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Structured console output (warn / error focus)
              {polling
                ? <span className="text-emerald-400 ml-1">· refreshes every 3 s{!pinned && ' (scroll paused)'}</span>
                : <span className="text-amber-400 ml-1">· paused</span>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value as LevelFilter)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium"
          >
            <option value="errors">Warn + Error</option>
            <option value="all">All levels</option>
          </select>
          <button
            onClick={() => setPolling(p => !p)}
            title={polling ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            {polling
              ? <><Pause className="h-3.5 w-3.5" /> Pause</>
              : <><CirclePlay className="h-3.5 w-3.5" /> Resume</>
            }
          </button>
          <button
            onClick={fetchLogs}
            title="Refresh now"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={clearLogs}
            title="Clear log buffer"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>

      <div className="relative">
        {error && (
          <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-border">
            Error fetching logs: {error}
          </div>
        )}
        <div ref={viewportRef} className="h-96 overflow-y-auto bg-[#0d1117] font-mono text-xs p-3 space-y-0.5">
          {visible.length === 0 && (
            <p className="text-slate-500 italic">
              {lines.length === 0
                ? 'No log lines captured yet.'
                : 'No warn or error entries — looking good.'}
            </p>
          )}
          {visible.map((l, i) => (
            <div key={i} className="flex gap-2 leading-5">
              <span className="text-slate-500 shrink-0 tabular-nums">
                {formatInTz(new Date(l.ts), timezone, { timeStyle: 'medium' })}
              </span>
              <span className={cn('shrink-0 uppercase w-8', LEVEL_STYLES[l.level])}>
                {l.level.slice(0, 4)}
              </span>
              <span className={cn('break-all whitespace-pre-wrap', LEVEL_STYLES[l.level])}>
                {l.msg}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Docker Log Viewer ─────────────────────────────────────────────────────────

const DOCKER_LINE_OPTS = [100, 200, 500]

function DockerLogViewer() {
  const [text, setText] = useState('')
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')
  const [n, setN] = useState(100)
  const [pinned, setPinned] = useState(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isNearBottom = useRef(true)

  const fetchDockerLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/docker-logs?n=${n}`)
      const data = await res.json() as { lines?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setText(data.lines ?? '')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }, [n])

  useEffect(() => {
    fetchDockerLogs()
  }, [fetchDockerLogs])

  useEffect(() => {
    if (polling) {
      intervalRef.current = setInterval(fetchDockerLogs, 5000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [polling, fetchDockerLogs])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < AUTO_SCROLL_THRESHOLD
      isNearBottom.current = near
      setPinned(near)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!polling) return
    if (!isNearBottom.current) return
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' })
  }, [text, polling])

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <Container className="h-4 w-4 text-primary" />
          <div>
            <p className="font-semibold text-sm">Docker Logs</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              stdout/stderr captured in-process (equivalent to docker logs --tail {n})
              {polling
                ? <span className="text-emerald-400 ml-1">· refreshes every 5 s{!pinned && ' (scroll paused — scroll to bottom to resume)'}</span>
                : <span className="text-amber-400 ml-1">· paused</span>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <select
            value={n}
            onChange={e => setN(Number(e.target.value))}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium"
          >
            {DOCKER_LINE_OPTS.map(opt => (
              <option key={opt} value={opt}>Tail {opt}</option>
            ))}
          </select>
          <button
            onClick={() => setPolling(p => !p)}
            title={polling ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            {polling
              ? <><Pause className="h-3.5 w-3.5" /> Pause</>
              : <><CirclePlay className="h-3.5 w-3.5" /> Resume</>
            }
          </button>
          <button
            onClick={fetchDockerLogs}
            title="Refresh now"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="px-4 py-2 flex items-start gap-2 border-t border-border bg-blue-500/5 text-xs text-blue-400/80">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          This buffer only captures output written <em>after</em> the server started — it misses early startup errors and native process output.
          For crash diagnosis or startup failures, SSH to the NAS and run:{' '}
          <code className="font-mono bg-muted/40 px-1 rounded">docker logs homebase-app --tail 100</code>
          {' '}— or use the <strong>NAS Docker Logs</strong> panel below.
        </span>
      </div>

      <div className="relative">
        {error && (
          <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-border">
            Error fetching Docker logs: {error}
          </div>
        )}
        <div ref={viewportRef} className="h-96 overflow-y-auto bg-[#0d1117] font-mono text-xs p-3">
          {!text && !error && (
            <p className="text-slate-500 italic">Loading Docker logs…</p>
          )}
          {text && (
            <pre className="text-slate-300 whitespace-pre-wrap break-all leading-5">{text}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

// ── NAS Docker Log Viewer ─────────────────────────────────────────────────────
// SSHes to the NAS host and runs `docker logs homebase-app --tail N`.
// Credentials are entered at runtime and never persisted.

const NAS_LINE_OPTS = [100, 200, 500]

function NasLogViewer() {
  const [host, setHost] = useState(() => typeof window !== 'undefined' ? (sessionStorage.getItem('nas_ssh_host') ?? '') : '')
  const [username, setUsername] = useState(() => typeof window !== 'undefined' ? (sessionStorage.getItem('nas_ssh_user') ?? '') : '')
  const [password, setPassword] = useState('')
  const [port, setPort] = useState('22')
  const [showPassword, setShowPassword] = useState(false)
  const [n, setN] = useState(100)
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)

  async function fetchNasLogs() {
    if (!host || !username || !password) {
      setError('Host, username, and password are required.')
      return
    }
    setBusy(true)
    setError('')
    // Persist host and user (not password) for convenience
    sessionStorage.setItem('nas_ssh_host', host)
    sessionStorage.setItem('nas_ssh_user', username)
    try {
      const res = await fetch('/api/admin/nas-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, username, password, port: Number(port) || 22, n }),
      })
      const data = await res.json() as { output?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setOutput(data.output ?? '')
      // Scroll to bottom after load
      requestAnimationFrame(() => {
        viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight })
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/20">
        <Network className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-sm">NAS Docker Logs</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            SSH to the NAS and run <code className="font-mono">docker logs homebase-app --tail {n}</code> — real container output including startup
          </p>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border space-y-3">
        <div className="grid grid-cols-[1fr_auto_1fr_1fr_auto_auto] gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Host / IP</label>
            <input
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="192.168.1.x"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Port</label>
            <input
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="22"
              className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 pr-7 text-xs"
                onKeyDown={e => { if (e.key === 'Enter') fetchNasLogs() }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tail</label>
            <select
              value={n}
              onChange={e => setN(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium"
            >
              {NAS_LINE_OPTS.map(opt => (
                <option key={opt} value={opt}>Tail {opt}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-transparent select-none">Go</label>
            <button
              onClick={fetchNasLogs}
              disabled={busy}
              className="h-8 flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {busy ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {output && (
        <div ref={viewportRef} className="h-96 overflow-y-auto bg-[#0d1117] font-mono text-xs p-3 border-t border-border">
          <pre className="text-slate-300 whitespace-pre-wrap break-all leading-5">{output}</pre>
        </div>
      )}
    </div>
  )
}

// ── Copy Code Button ──────────────────────────────────────────────────────────

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-sm bg-muted rounded px-3 py-1.5 hover:bg-muted/80 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {code}
    </button>
  )
}

// ── Create Family Dialog ──────────────────────────────────────────────────────

function CreateFamilyDialog({
  myFamilyId,
  onCreated,
}: {
  myFamilyId: string | null
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [copyRecipes, setCopyRecipes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ inviteCode: string; recipesCopied: number } | null>(null)

  function reset() {
    setName('')
    setCopyRecipes(false)
    setResult(null)
  }

  async function handleCreate() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          copyRecipesFromFamilyId: copyRecipes ? myFamilyId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult({ inviteCode: data.inviteCode, recipesCopied: data.recipesCopied })
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create family')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" /> Create Family
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-4">
      <p className="font-semibold text-sm">Create New Family</p>

      {!result ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Family name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Smith Family"
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>

          {myFamilyId && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={copyRecipes}
                onChange={e => setCopyRecipes(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Copy recipes &amp; recipe books from your family</span>
            </label>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={busy || !name.trim()}
              className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {busy ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setOpen(false); reset() }}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/40 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Family created successfully</p>
            <p className="text-xs text-muted-foreground">Share this admin invite code. It expires in 7 days and makes the first registrant a family admin.</p>
            <CopyCode code={result.inviteCode} />
            {result.recipesCopied > 0 && (
              <p className="text-xs text-muted-foreground">{result.recipesCopied} recipes copied.</p>
            )}
          </div>
          <button
            onClick={() => { setOpen(false); reset() }}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/40 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}

// ── Family Row ────────────────────────────────────────────────────────────────

function FamilyCard({ family }: { family: FamilyRow }) {
  const [expanded, setExpanded] = useState(false)
  const [users, setUsers] = useState<FamilyUser[] | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [resetTargetId, setResetTargetId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  async function loadUsers() {
    setLoadingUsers(true)
    try {
      const res = await fetch(`/api/admin/families/${family.id}/users`)
      const data = await res.json()
      setUsers(data)
    } finally {
      setLoadingUsers(false)
    }
  }

  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && users === null) loadUsers()
  }

  async function generateInvite() {
    setGeneratingInvite(true)
    try {
      const res = await fetch(`/api/admin/families/${family.id}/invite`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setInviteCode(data.inviteCode)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate invite')
    } finally {
      setGeneratingInvite(false)
    }
  }

  async function resetPassword(userId: string) {
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/families/${family.id}/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      toast.success('Password reset successfully')
      setResetTargetId(null)
      setNewPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleExpand}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
          </button>
          <div>
            <p className="font-medium text-sm">{family.name}</p>
            <p className="text-xs text-muted-foreground">
              {family.memberCount} member{family.memberCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {inviteCode ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Invite:</span>
              <CopyCode code={inviteCode} />
            </div>
          ) : (
            <button
              onClick={generateInvite}
              disabled={generatingInvite}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:opacity-50 transition-colors"
            >
              {generatingInvite ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Invite
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {loadingUsers && <p className="text-xs text-muted-foreground">Loading members…</p>}
          {users && users.length === 0 && <p className="text-xs text-muted-foreground italic">No members yet.</p>}
          {users && users.map(u => (
            <div key={u.id} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email} · <span className="capitalize">{u.role}</span></p>
                </div>
                <button
                  onClick={() => {
                    setResetTargetId(resetTargetId === u.id ? null : u.id)
                    setNewPassword('')
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Reset password
                </button>
              </div>
              {resetTargetId === u.id && (
                <div className="flex items-center gap-2 pl-0">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="h-8 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') resetPassword(u.id) }}
                  />
                  <button
                    onClick={() => resetPassword(u.id)}
                    disabled={resetting || newPassword.length < 8}
                    className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {resetting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Set
                  </button>
                  <button
                    onClick={() => { setResetTargetId(null); setNewPassword('') }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Families Tab ──────────────────────────────────────────────────────────────

function FamiliesTab() {
  const [families, setFamilies] = useState<FamilyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [myFamilyId, setMyFamilyId] = useState<string | null>(null)

  async function loadFamilies() {
    try {
      const [familiesRes, sessionRes] = await Promise.all([
        fetch('/api/admin/families'),
        fetch('/api/auth/session'),
      ])
      if (familiesRes.status === 403) { setForbidden(true); return }
      const data = await familiesRes.json()
      setFamilies(data)
      const session = await sessionRes.json()
      setMyFamilyId(session?.user?.familyId ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFamilies() }, [])

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  if (forbidden) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">System admin access required</p>
        <p className="text-xs text-muted-foreground mt-1">Only the system admin can manage families.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CreateFamilyDialog myFamilyId={myFamilyId} onCreated={loadFamilies} />
      {families.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No families found.</p>
      )}
      {families.map(f => <FamilyCard key={f.id} family={f} />)}
    </div>
  )
}

// ── Private Events Diagnostic Panel ──────────────────────────────────────────

interface PrivateEventRow {
  id: string
  title: string
  createdByName: string
  start: string
  end: string
  isAllDay: boolean
  isRecurring: boolean
  recurrenceRule: string | null
  recurrenceEndDate: string | null
  category: string | null
}

function PrivateEventsPanel() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ total: number; events: PrivateEventRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetch_() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/events/private')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Personal Events (Unmasked)</p>
          <p className="text-xs text-muted-foreground mt-0.5">Shows all events marked as personal with their real titles and owners.</p>
        </div>
        <button
          onClick={fetch_}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {loading ? 'Loading…' : 'Fetch'}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {data && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{data.total} personal event{data.total !== 1 ? 's' : ''} found</p>
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground italic">No personal events.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-2 py-1.5 font-medium">Title</th>
                    <th className="text-left px-2 py-1.5 font-medium">Owner</th>
                    <th className="text-left px-2 py-1.5 font-medium">Start</th>
                    <th className="text-left px-2 py-1.5 font-medium">End</th>
                    <th className="text-left px-2 py-1.5 font-medium">Recurring</th>
                    <th className="text-left px-2 py-1.5 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map(e => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-1.5 font-medium">{e.title}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{e.createdByName}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{e.start}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{e.end}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {e.isRecurring ? (e.recurrenceRule ?? 'yes') : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{e.category ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'operations' | 'families'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('operations')

  async function runSpawnNow() {
    const res = await fetch('/api/admin/spawn-now', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Spawn failed')
    return data as SpawnResponse
  }

  async function runWarmCache() {
    const res = await fetch('/api/images/warm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Warm failed')
    return data as WarmResponse
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 h-full overflow-y-auto">
      <PageHero title="Admin" subtitle="Administrative tools and debugging — visible to admins only." />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'operations', label: 'Operations', icon: Terminal },
          { id: 'families',   label: 'Families',   icon: Users },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Operations tab */}
      {tab === 'operations' && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Scheduler</h2>
            <ActionCard
              title="Run Spawn Now"
              description="Immediately runs the draft-spawn worker for all families. Safe to run multiple times — idempotent."
              buttonLabel="Run Spawn"
              onRun={runSpawnNow}
              renderResult={(r) => <SpawnResultView result={r as SpawnResponse} />}
            />
            <ActionCard
              title="Warm Image Cache"
              description="Downloads and caches up to 100 uncached recipe images per run. Run again while images remain. Safe to repeat — already-cached images are skipped."
              buttonLabel="Warm Cache"
              onRun={runWarmCache}
              renderResult={(r) => <WarmResultView result={r as WarmResponse} />}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Server Logs — Errors &amp; Warnings</h2>
            <LogViewer />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Raw Output — Full stdout / stderr</h2>
            <DockerLogViewer />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">NAS Docker Logs — Real Container Output</h2>
            <NasLogViewer />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Diagnostics</h2>
            <PrivateEventsPanel />
          </section>
        </>
      )}

      {/* Families tab */}
      {tab === 'families' && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Families</h2>
            <p className="text-xs text-muted-foreground mt-1">Create families and manage their members. Only visible to system admins.</p>
          </div>
          <FamiliesTab />
        </section>
      )}
    </div>
  )
}
