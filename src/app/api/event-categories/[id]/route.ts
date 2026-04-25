import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
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
