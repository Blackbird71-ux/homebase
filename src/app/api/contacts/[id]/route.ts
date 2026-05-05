import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.householdContact.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Handle PIN changes
  let pinHash = existing.pinHash
  if (body.pin === null) {
    pinHash = null
  } else if (typeof body.pin === 'string' && body.pin.length > 0) {
    const bcrypt = await import('bcryptjs')
    pinHash = await bcrypt.hash(body.pin, 10)
  }
  const contact = await prisma.householdContact.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.pin !== undefined ? { pinHash } : {}),
    },
  })

  if (body.name !== undefined && body.name !== existing.name) {
    void createAuditLog(
      user,
      'update',
      'contact',
      id,
      `Renamed contact "${existing.name}" to "${body.name}"`,
      { before: { name: existing.name }, after: { name: body.name } }
    )
  }

  return NextResponse.json(contact)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.householdContact.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.householdContact.delete({ where: { id } })

  void createAuditLog(
    user,
    'delete',
    'contact',
    id,
    `Deleted contact "${existing.name}"`,
    { contact: { name: existing.name, category: existing.category } }
  )

  return NextResponse.json({ success: true })
}

