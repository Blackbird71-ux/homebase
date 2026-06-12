import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { isValidBirthdayDate } from '@/lib/date-engine'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contacts = await prisma.householdContact.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(contacts)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, category, phone, email, address, notes, birthday, pin } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (birthday != null && !isValidBirthdayDate(birthday)) {
    return NextResponse.json({ error: 'birthday must be YYYY-MM-DD or MM-DD' }, { status: 400 })
  }

  // Hash PIN if provided
  let pinHash: string | null = null
  if (pin) {
    const bcrypt = await import('bcryptjs')
    pinHash = await bcrypt.hash(pin, 10)
  }

  const contact = await prisma.householdContact.create({
    data: {
      name,
      category: category ?? 'other',
      phone: phone ?? null,
      email: email ?? null,
      address: address ?? null,
      notes: notes ?? null,
      birthday: birthday ?? null,
      pinHash,
      familyId: user.familyId,
    },
  })

  void createAuditLog(
    user,
    'create',
    'contact',
    contact.id,
    `Added contact "${name}"`,
    { contact: { name, category } }
  )

  return NextResponse.json(contact, { status: 201 })
}
