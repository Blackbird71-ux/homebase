import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { PANTRY_STATUSES, PANTRY_LOCATIONS } from '@/lib/pantry-helpers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  const item = await prisma.pantryItem.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    if (!body.name?.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    data.name = body.name.trim()
  }
  if (body.location !== undefined) {
    if (!PANTRY_LOCATIONS.includes(body.location)) return NextResponse.json({ error: 'invalid location' }, { status: 400 })
    data.location = body.location
  }
  if (body.status !== undefined) {
    if (!PANTRY_STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    data.status = body.status
  }
  if (body.isStaple !== undefined) data.isStaple = !!body.isStaple
  if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null

  const updated = await prisma.pantryItem.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const item = await prisma.pantryItem.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  await prisma.pantryItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
