// Next.js instrumentation hook — runs once when the server starts
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only run on the Node.js server (not Edge runtime or client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Patch console methods into the in-memory log buffer first so scheduler
    // output is captured from the very start.
    const { logBuffer, rawLogBuffer } = await import('@/lib/logBuffer')

    // ── Structured console capture ──────────────────────────────────────────
    const levels = ['log', 'info', 'warn', 'error'] as const
    for (const level of levels) {
      const orig = console[level].bind(console)
      console[level] = (...args: unknown[]) => {
        logBuffer.push(level, args)
        orig(...args)
      }
    }

    // ── Raw stdout / stderr capture (equivalent to `docker logs` output) ────
    const origStdout = process.stdout.write.bind(process.stdout)
    const origStderr = process.stderr.write.bind(process.stderr)

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

    const { initScheduler } = await import('@/lib/scheduler')
    initScheduler()

    const { startReportScheduler } = await import('@/lib/reportScheduler')
    startReportScheduler()

    const { startSpawnScheduler } = await import('@/lib/spawnScheduler')
    startSpawnScheduler()
  }
}
