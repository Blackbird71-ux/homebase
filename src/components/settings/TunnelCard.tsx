'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Circle, Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'

interface TunnelStatus {
  loggedIn: boolean
  tunnelCreated: boolean
  configured: boolean
  tunnelId: string | null
  // Runtime health (present when the server is running in Docker)
  inContainer?: boolean
  running?: boolean
  readyConnections?: number | null
  processAlive?: boolean
  originReachable?: boolean
  uptime?: string | null
}

function LiveHealthBadge({ status }: { status: TunnelStatus }) {
  // Only meaningful in the container; local dev has no tunnel process.
  if (!status.inContainer) return null

  if (status.running) {
    const conns = status.readyConnections ?? 0
    return (
      <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-green-500/10 text-green-700 dark:text-green-400">
        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Tunnel connected — {conns} edge connection{conns === 1 ? '' : 's'} ready
          {status.uptime ? ` · up ${status.uptime}` : ''}.
          {!status.originReachable && ' (Warning: origin localhost:3000 not responding.)'}
        </span>
      </div>
    )
  }

  if (status.processAlive) {
    return (
      <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />
        <span>cloudflared is running but not yet connected to Cloudflare. Reconnecting…</span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>Tunnel not running. The supervisor restarts it automatically every ~5s — or use Restart below.</span>
    </div>
  )
}

type StepState = 'pending' | 'active' | 'done' | 'error'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') return <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
  if (state === 'active') return <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
  if (state === 'error') return <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
  return <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
}

export function TunnelCard() {
  const [status, setStatus] = useState<TunnelStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — login
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [loginPolling, setLoginPolling] = useState(false)

  // Step 2 — create
  const [createLoading, setCreateLoading] = useState(false)
  const [createdTunnelId, setCreatedTunnelId] = useState<string | null>(null)

  // Step 3 — configure
  const [configLoading, setConfigLoading] = useState(false)
  const [tunnelIdInput, setTunnelIdInput] = useState('')
  const [hostname, setHostname] = useState('homebase.liddleapps.com')

  // Step 4 — restart
  const [restartLoading, setRestartLoading] = useState(false)
  const [restartDone, setRestartDone] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tunnel/status')
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Failed to load tunnel status')
        return null
      }
      const data: TunnelStatus = await res.json()
      setStatus(data)
      if (data.tunnelId && !tunnelIdInput) setTunnelIdInput(data.tunnelId)
      return data
    } catch {
      setError('Network error loading tunnel status')
      return null
    } finally {
      setLoading(false)
    }
  }, [tunnelIdInput])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleLogin() {
    setLoginLoading(true)
    setLoginUrl(null)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/login', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setLoginUrl(data.url)
      setLoginPolling(true)
      pollForLogin()
    } catch {
      setError('Network error')
    } finally {
      setLoginLoading(false)
    }
  }

  function pollForLogin() {
    const interval = setInterval(async () => {
      const s = await fetchStatus()
      if (s?.loggedIn) {
        clearInterval(interval)
        setLoginPolling(false)
        setLoginUrl(null)
      }
    }, 3000)
    // Stop polling after 5 minutes
    setTimeout(() => { clearInterval(interval); setLoginPolling(false) }, 300000)
  }

  async function handleCreate() {
    setCreateLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/create', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setCreatedTunnelId(data.tunnelId)
      setTunnelIdInput(data.tunnelId)
      await fetchStatus()
    } catch {
      setError('Network error')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleConfigure() {
    setConfigLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelId: tunnelIdInput.trim(), hostname }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      if (data?.dnsWarning) setError(data.dnsWarning)
      await fetchStatus()
    } catch {
      setError('Network error')
    } finally {
      setConfigLoading(false)
    }
  }

  async function handleRestart() {
    setRestartLoading(true)
    setRestartDone(false)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/restart', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setRestartDone(true)
      await fetchStatus()
    } catch {
      setError('Network error')
    } finally {
      setRestartLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cloudflare Tunnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading tunnel status...
          </div>
        </CardContent>
      </Card>
    )
  }

  const loggedIn = status?.loggedIn ?? false
  const tunnelCreated = status?.tunnelCreated ?? false
  const configured = status?.configured ?? false
  const allDone = loggedIn && tunnelCreated && configured
  // The tunnel is running if the server reports a live connection, or we just
  // restarted it this session. Don't rely on local restartDone state alone —
  // on a fresh page load it's false even when the tunnel is up.
  const isRunning = restartDone || (status?.running ?? false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloudflare Tunnel</CardTitle>
        <CardDescription>
          Set up the Cloudflare tunnel so HomeBase is reachable at homebase.liddleapps.com.
          cloudflared is bundled in this container — no external install needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {configured && status && <LiveHealthBadge status={status} />}

        {/* Step 1 — Authenticate */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StepIcon state={loggedIn ? 'done' : 'pending'} />
            <span className="font-medium text-sm">Step 1: Authenticate with Cloudflare</span>
          </div>
          {!loggedIn && (
            <div className="ml-8 space-y-3">
              <Button type="button" onClick={handleLogin} disabled={loginLoading || loginPolling} size="sm">
                {loginLoading ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Contacting Cloudflare...</> : 'Connect to Cloudflare'}
              </Button>
              {loginUrl && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Open this URL in your browser to log in:</p>
                  <a
                    href={loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary underline break-all"
                  >
                    {loginUrl}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {loginPolling && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Waiting for authentication...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2 — Create tunnel */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StepIcon state={tunnelCreated ? 'done' : loggedIn ? 'pending' : 'pending'} />
            <span className={`font-medium text-sm ${!loggedIn ? 'text-muted-foreground' : ''}`}>
              Step 2: Create Tunnel
            </span>
          </div>
          {loggedIn && !tunnelCreated && (
            <div className="ml-8 space-y-3">
              <Button type="button" onClick={handleCreate} disabled={createLoading} size="sm">
                {createLoading ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Creating...</> : 'Create Tunnel'}
              </Button>
            </div>
          )}
          {createdTunnelId && (
            <p className="ml-8 text-sm text-muted-foreground">Tunnel ID: <code className="font-mono">{createdTunnelId}</code></p>
          )}
        </div>

        {/* Step 3 — Configure */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StepIcon state={configured ? 'done' : loggedIn ? 'pending' : 'pending'} />
            <span className={`font-medium text-sm ${!loggedIn ? 'text-muted-foreground' : ''}`}>
              Step 3: Save Configuration
            </span>
          </div>
          {loggedIn && !configured && (
            <div className="ml-8 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tunnel-id" className="text-sm">Tunnel ID</Label>
                <Input
                  id="tunnel-id"
                  value={tunnelIdInput}
                  onChange={e => setTunnelIdInput(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tunnel-hostname" className="text-sm">Hostname</Label>
                <Input
                  id="tunnel-hostname"
                  value={hostname}
                  onChange={e => setHostname(e.target.value)}
                  placeholder="homebase.liddleapps.com"
                />
              </div>
              <Button type="button" onClick={handleConfigure} disabled={configLoading || !tunnelIdInput} size="sm">
                {configLoading ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Saving...</> : 'Save Config'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Saving also creates the Cloudflare DNS record for <strong>{hostname}</strong> automatically —
                no dashboard step needed.
              </p>
            </div>
          )}
        </div>

        {/* Step 4 — Start / restart tunnel */}
        {configured && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StepIcon state={isRunning ? 'done' : 'pending'} />
              <span className="font-medium text-sm">
                {isRunning ? 'Tunnel Active' : 'Start Tunnel'}
              </span>
            </div>
            <div className="ml-8 flex items-center gap-3">
              <Button type="button" onClick={handleRestart} disabled={restartLoading} size="sm" variant={isRunning ? 'outline' : 'default'}>
                {restartLoading
                  ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Starting...</>
                  : <><RefreshCw className="h-3 w-3 mr-2" />{isRunning ? 'Restart Tunnel' : 'Start Tunnel'}</>
                }
              </Button>
              {isRunning && (
                <span className="text-sm text-green-600 dark:text-green-400">Tunnel running</span>
              )}
            </div>
            {status?.tunnelId && (
              <p className="ml-8 text-xs text-muted-foreground">
                Tunnel ID: <code className="font-mono">{status.tunnelId}</code>
              </p>
            )}
          </div>
        )}

        <Button type="button" variant="ghost" size="sm" onClick={() => fetchStatus()} className="text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh status
        </Button>
      </CardContent>
    </Card>
  )
}
