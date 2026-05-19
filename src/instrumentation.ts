// Next.js instrumentation hook — runs once when the server starts
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only run on the Node.js server (not Edge runtime or client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logBuffer, rawLogBuffer } = await import('@/lib/logBuffer')

    // ── Grab original stdout/stderr writers before we patch anything ───────
    const origStdout = process.stdout.write.bind(process.stdout)
    const origStderr = process.stderr.write.bind(process.stderr)

    // ── Raw stdout / stderr capture (equivalent to `docker logs` output) ────
    // This catches anything that writes to process.stdout/stderr directly
    // without going through console.log (e.g. Next.js internal output, native
    // module printf, child processes inheriting our fds).
    process.stdout.write = function (
      this: typeof process.stdout,
      ...args: Parameters<typeof process.stdout.write>
    ): boolean {
      const chunk = typeof args[0] === 'string' ? args[0] : Buffer.from(args[0]).toString()
      rawLogBuffer.write(chunk)
      return origStdout(...args)
    } as typeof process.stdout.write

    process.stderr.write = function (
      this: typeof process.stderr,
      ...args: Parameters<typeof process.stderr.write>
    ): boolean {
      const chunk = typeof args[0] === 'string' ? args[0] : Buffer.from(args[0]).toString()
      rawLogBuffer.write(chunk)
      return origStderr(...args)
    } as typeof process.stderr.write

    // ── Structured console capture ──────────────────────────────────────────
    // We write to BOTH the structured logBuffer (for the /api/admin/logs
    // endpoint) AND the rawLogBuffer (for the /api/admin/docker-logs endpoint)
    // directly from the console patch.  We bypass the original console.log
    // and write formatted output straight to the real stdout/stderr so there
    // are no duplicates in rawLogBuffer (one from us, one from the
    // process.stdout.write patch forwarding the original console output).
    const levels = ['log', 'info', 'warn', 'error'] as const
    for (const level of levels) {
      console[level] = (...args: unknown[]) => {
        const msg = args
          .map(a => (typeof a === 'string' ? a : safeStringify(a)))
          .join(' ')
        const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
        logBuffer.push(level, args)
        rawLogBuffer.write(line)
        // Write to real stdout/stderr so `docker logs` still shows output.
        // warn/error go to stderr; log/info go to stdout (Unix convention).
        const output = (level === 'error' || level === 'warn') ? origStderr : origStdout
        output(line)
      }
    }

    function safeStringify(v: unknown): string {
      try {
        if (v instanceof Error) return v.stack ?? v.message
        return JSON.stringify(v)
      } catch {
        return String(v)
      }
    }

    // ── HTTP request logging (feeds both structured + raw log buffers) ─────
    // Uses Node.js diagnostics_channel (available since Node 19) to intercept
    // every incoming HTTP request without middleware overhead.  Filters out
    // static assets and health checks to keep the log readable.
    try {
      const dc = await import('node:diagnostics_channel')
      dc.subscribe('http.server.request.start', (message: unknown) => {
        const req = (message as { request?: { method?: string; url?: string } })?.request
        if (!req) return
        const url = req.url ?? ''
        const method = req.method ?? ''
        // Skip health-check pings, admin log-polling (would flood their own buffer), and static assets
        if (url === '/api/health') return
        if (url.startsWith('/api/admin/logs') || url.startsWith('/api/admin/docker-logs')) return
        if (/^\/(_next|static|favicon\.ico|file\.svg|globe\.svg|next\.svg|vercel\.svg|window\.svg|sw\.js|offline\.html)/.test(url)) return
        console.log(`[http] ${method} ${url}`)
      })
    } catch {
      // diagnostics_channel may not exist in older Node.js — fail silently
    }

    const { initScheduler } = await import('@/lib/scheduler')
    initScheduler()

    const { startReportScheduler } = await import('@/lib/reportScheduler')
    startReportScheduler()

    const { startSpawnScheduler } = await import('@/lib/spawnScheduler')
    startSpawnScheduler()
  }
}
