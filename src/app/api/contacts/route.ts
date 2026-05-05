import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function GET() {
  const user = await requireSession()

  const contacts = await prisma.householdContact.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(contacts)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { name, category, phone, email, address, notes, pin } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
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
