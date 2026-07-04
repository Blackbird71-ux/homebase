import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { name, color } = body

  const existing = await prisma.eventCategory.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    data.name = name.trim()
  }
  if (color !== undefined) {
    data.color = color ?? null
  }

  const updated = await prisma.eventCategory.update({
    where: { id },
    data,
  })

  return NextResponse.json(updated)
}

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.eventCategory.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.isSystem) {
    return NextResponse.json({ error: 'System categories cannot be deleted' }, { status: 403 })
  }

  await prisma.eventCategory.delete({ where: { id } })

  return NextResponse.json({ success: true })
}

export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
