import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { jsonWithETag } from '@/lib/http-cache'
import { createListCategory } from '@/lib/list-categories'

async function _GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.listCategory.findMany({
    where: { familyId: user.familyId },
    orderBy: { sortOrder: 'asc' },
  })
  return jsonWithETag(req, categories)
}

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, color } = await req.json()

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  const trimmedName = name.trim()

  const existing = await prisma.listCategory.findFirst({
    where: { familyId: user.familyId, name: trimmedName },
  })
  if (existing) {
    return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
  }

  const category = await createListCategory(user.familyId, trimmedName, color ?? null)
  return NextResponse.json(category, { status: 201 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
