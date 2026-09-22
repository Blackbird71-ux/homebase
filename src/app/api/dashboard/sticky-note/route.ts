import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { saveStickyNote, STICKY_NOTE_MAX_LENGTH } from '@/lib/sticky-note'

async function _PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const scope = body?.scope
  const content = body?.content
  if (scope !== 'shared' && scope !== 'personal') {
    return NextResponse.json({ error: "scope must be 'shared' or 'personal'" }, { status: 400 })
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }
  if (content.length > STICKY_NOTE_MAX_LENGTH) {
    return NextResponse.json({ error: `Note is too long (max ${STICKY_NOTE_MAX_LENGTH} characters)` }, { status: 400 })
  }

  const note = await saveStickyNote(user.familyId, user.id, scope, content)
  return NextResponse.json(note)
}

export const PUT = withRouteErrors(_PUT)
