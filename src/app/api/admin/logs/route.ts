import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { logBuffer } from '@/lib/logBuffer'
import type { SessionUser } from '@/types'

// GET /api/admin/logs?n=200
// Returns the last N log lines from the in-memory ring buffer.
// Admin only. Uses auth() directly — requireSession uses next/navigation redirect()
// which throws a special error in API routes, causing HTML responses instead of JSON.
async function _GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const n = Math.min(parseInt(searchParams.get('n') ?? '200', 10), 500)
  return NextResponse.json({ lines: logBuffer.lines(n) })
}

// DELETE /api/admin/logs — clear the buffer
async function _DELETE() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  logBuffer.clear()
  return NextResponse.json({ ok: true })
}

export const GET = withRouteErrors(_GET)
export const DELETE = withRouteErrors(_DELETE)
