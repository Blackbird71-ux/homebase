import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withRouteErrors } from '@/lib/route-errors'
import { habitCtxFromUser, setHabitCheckIn } from '@/lib/habits'
import type { SessionUser } from '@/types'

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json()
  if (typeof body.done !== 'boolean') return NextResponse.json({ error: 'done must be a boolean' }, { status: 400 })
  if (body.date !== undefined && typeof body.date !== 'string') return NextResponse.json({ error: 'date must be a string' }, { status: 400 })

  const result = await setHabitCheckIn(habitCtxFromUser(user), id, body.done, body.date)
  if (result === 'not-found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (result === 'bad-date') return NextResponse.json({ error: 'date must be YYYY-MM-DD, today or within the previous 6 days' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export const POST = withRouteErrors(_POST)
