import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { PANTRY_STATUSES, PANTRY_LOCATIONS, matchPantryItem } from '@/lib/pantry-helpers'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.pantryItem.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ location: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(items)
}

async function _POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, location, status, isStaple, expiryDate } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (location && !PANTRY_LOCATIONS.includes(location)) {
    return NextResponse.json({ error: 'invalid location' }, { status: 400 })
  }
  if (status && !PANTRY_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const existing = await prisma.pantryItem.findMany({ where: { familyId: user.familyId } })
  const duplicate = matchPantryItem(existing, name)
  if (duplicate) {
    return NextResponse.json(
      { error: `"${duplicate.name}" is already in the pantry`, existingId: duplicate.id },
      { status: 409 }
    )
  }

  const item = await prisma.pantryItem.create({
    data: {
      familyId: user.familyId,
      name: name.trim(),
      location: location ?? 'pantry',
      status: status ?? 'stocked',
      isStaple: isStaple ?? true,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    },
  })

  return NextResponse.json(item)
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
