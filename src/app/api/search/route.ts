import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { globalSearch } from '@/lib/global-search'
import type { SessionUser } from '@/types'

export async function GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id || !user.familyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = new URL(req.url).searchParams.get('q') ?? ''
  const results = await globalSearch(user.familyId, user.id, q)
  return NextResponse.json({ results })
}
