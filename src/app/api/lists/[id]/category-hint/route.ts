import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { suggestListCategory } from '@/lib/list-category-hint'

async function _GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
    select: { categoryOrder: true },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let allowed: string[] = []
  try { allowed = list.categoryOrder ? JSON.parse(list.categoryOrder) : [] } catch { /* none */ }

  const q = new URL(req.url).searchParams.get('q') ?? ''
  const category = await suggestListCategory(user.familyId, q, allowed)
  return NextResponse.json({ category })
}

export const GET = withRouteErrors(_GET)
