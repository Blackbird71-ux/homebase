import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { logBuffer } from '@/lib/logBuffer'

// GET /api/admin/logs?n=200
// Returns the last N log lines from the in-memory ring buffer.
// Admin only.
export async function GET(req: Request) {
  const user = await requireSession()
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const n = Math.min(parseInt(searchParams.get('n') ?? '200', 10), 500)
  return NextResponse.json({ lines: logBuffer.lines(n) })
}

// DELETE /api/admin/logs — clear the buffer
export async function DELETE() {
  const user = await requireSession()
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  logBuffer.clear()
  return NextResponse.json({ ok: true })
}
