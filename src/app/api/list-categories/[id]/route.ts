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
  const { name, color } = await req.json()

  const existing = await prisma.listCategory.findFirst({ where: { id, familyId: user.familyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: { name?: string; color?: string | null } = {}
  if (name !== undefined) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const trimmed = name.trim()
    const clash = await prisma.listCategory.findFirst({
      where: { familyId: user.familyId, name: trimmed, NOT: { id } },
    })
    if (clash) return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
    data.name = trimmed
  }
  if (color !== undefined) data.color = color ?? null

  const updated = await prisma.listCategory.update({ where: { id }, data })
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

  const existing = await prisma.listCategory.findFirst({ where: { id, familyId: user.familyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.listCategory.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
