import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withRouteErrors } from '@/lib/route-errors'
import { deleteHabit, habitCtxFromUser, parseHabitInput, updateHabit } from '@/lib/habits'
import type { SessionUser } from '@/types'

async function _PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = parseHabitInput(await req.json(), false)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const habit = await updateHabit(habitCtxFromUser(user), id, parsed.data)
  if (!habit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(habit)
}

async function _DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  if (!(await deleteHabit(habitCtxFromUser(user), id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
