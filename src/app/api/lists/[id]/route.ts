import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { name, isActive, type, createdBy } = body

  if (type !== undefined && type !== 'SHOPPING' && type !== 'TODO') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const existing = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Validate createdBy if provided — must be a family member
  if (createdBy !== undefined) {
    const member = await prisma.user.findFirst({
      where: { id: createdBy, familyId: user.familyId },
    })
    if (!member) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    }
  }

  const updated = await prisma.list.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(isActive !== undefined && { isActive }),
      ...(type !== undefined && { type }),
      ...(createdBy !== undefined && { createdBy }),
    },
  })

  if (name !== undefined && name !== existing.name) {
    void createAuditLog(
      user,
      'update',
      'list',
      id,
      `Renamed list "${existing.name}" to "${name}"`,
      { before: { name: existing.name }, after: { name } }
    )
  }

  if (type !== undefined && type !== existing.type) {
    void createAuditLog(
      user,
      'update',
      'list',
      id,
      `Converted list "${existing.name}" from ${existing.type} to ${type}`,
      { before: { type: existing.type }, after: { type } }
    )
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.list.delete({ where: { id } })

  void createAuditLog(
    user,
    'delete',
    'list',
    id,
    `Deleted list "${existing.name}"`,
    { list: { name: existing.name, type: existing.type } }
  )

  return NextResponse.json({ ok: true })
}
