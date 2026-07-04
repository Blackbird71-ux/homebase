import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { isValidBirthdayDate } from '@/lib/date-engine'

async function _PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.householdContact.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (body.birthday != null && !isValidBirthdayDate(body.birthday)) {
    return NextResponse.json({ error: 'birthday must be YYYY-MM-DD or MM-DD' }, { status: 400 })
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
      ...(body.birthday !== undefined ? { birthday: body.birthday } : {}),
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

async function _DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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


export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
