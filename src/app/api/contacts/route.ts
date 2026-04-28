import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

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
  const { name, category, phone, email, address, notes } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const contact = await prisma.householdContact.create({
    data: {
      name,
      category: category ?? 'other',
      phone: phone ?? null,
      email: email ?? null,
      address: address ?? null,
      notes: notes ?? null,
      familyId: user.familyId,
    },
  })

  return NextResponse.json(contact, { status: 201 })
}
