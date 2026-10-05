import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withRouteErrors } from '@/lib/route-errors'
import { createHabit, habitCtxFromUser, listHabits, parseHabitInput } from '@/lib/habits'
import type { SessionUser } from '@/types'

async function _GET(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true'
  return NextResponse.json(await listHabits(habitCtxFromUser(user), { includeInactive }))
}

async function _POST(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseHabitInput(await req.json(), true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const habit = await createHabit(habitCtxFromUser(user), { ...parsed.data, name: parsed.data.name! })
  return NextResponse.json(habit, { status: 201 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
