// Next.js instrumentation hook — runs once when the server starts
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only run on the Node.js server (not Edge runtime or client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Patch console methods into the in-memory log buffer first so scheduler
    // output is captured from the very start.
    const { logBuffer } = await import('@/lib/logBuffer')
    const levels = ['log', 'info', 'warn', 'error'] as const
    for (const level of levels) {
      const orig = console[level].bind(console)
      console[level] = (...args: unknown[]) => {
        logBuffer.push(level, args)
        orig(...args)
      }
    }

    const { initScheduler } = await import('@/lib/scheduler')
    initScheduler()

    const { startReportScheduler } = await import('@/lib/reportScheduler')
    startReportScheduler()

    const { startSpawnScheduler } = await import('@/lib/spawnScheduler')
    startSpawnScheduler()
  }
}
