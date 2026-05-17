import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { rawLogBuffer } from '@/lib/logBuffer'

// GET /api/admin/docker-logs?n=100
// Returns the last N lines of raw stdout/stderr — the same output you'd get
// from `docker logs homebase-app --tail N`. Admin only.
export async function GET(req: Request) {
  const user = await requireSession()
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const rawN = parseInt(searchParams.get('n') ?? '100', 10)
  const n = Math.min(Math.max(isNaN(rawN) ? 100 : rawN, 1), 1000)

  const full = rawLogBuffer.text()
  // Split into lines and tail N (lines may contain \n or \r\n)
  const allLines = full.split(/\r?\n/)
  const tail = allLines.slice(-n).join('\n')

  return NextResponse.json({ lines: tail, n, totalBytes: full.length })
}
