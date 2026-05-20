import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { logBuffer, rawLogBuffer } from '@/lib/logBuffer'
import type { SessionUser } from '@/types'

// GET /api/admin/docker-logs?n=100&format=raw|structured|both
//
// Returns the last N lines of raw stdout/stderr — the same output you'd get
// from `docker logs homebase-app --tail N`.  Console.log / warn / error calls
// are captured directly (see instrumentation.ts) so they appear with timestamps
// even if the process.stdout.write forwarding path is bypassed by Next.js.
//
// Query params:
//   n        Number of lines (default 100, max 1000)
//   format   "raw" (default) — raw stdout/stderr text
//            "structured"   — JSON array of {ts, level, msg}
//            "both"         — { raw, structured }
//
// Admin only. Uses auth() directly — requireSession uses next/navigation redirect()
// which throws a special error in API routes, causing HTML responses instead of JSON.
export async function GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const rawN = parseInt(searchParams.get('n') ?? '100', 10)
  const n = Math.min(Math.max(isNaN(rawN) ? 100 : rawN, 1), 1000)
  const format = searchParams.get('format') ?? 'raw'

  // ── Raw output (stdout/stderr + console captures) ──────────────────────
  const full = rawLogBuffer.text()
  const allLines = full.split(/\r?\n/)
  const tail = allLines.slice(-n).join('\n')

  // ── Structured output (console.log/warn/error with timestamps) ─────────
  const structured = logBuffer.lines(n)

  if (format === 'structured') {
    return NextResponse.json({ lines: structured, n })
  }

  if (format === 'both') {
    return NextResponse.json({
      raw: tail,
      structured,
      n,
      totalRawBytes: full.length,
    })
  }

  // Default: raw (docker-logs equivalent)
  return NextResponse.json({ lines: tail, n, totalBytes: full.length })
}

// DELETE /api/admin/docker-logs — clear both buffers
export async function DELETE() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  logBuffer.clear()
  rawLogBuffer.clear()
  return NextResponse.json({ ok: true })
}
