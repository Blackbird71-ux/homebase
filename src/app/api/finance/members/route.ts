import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const members = await prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  // Add usage counts across bills, income, and transactions
  const enriched = await Promise.all(members.map(async (m) => {
    const [bills, income, transactions] = await Promise.all([
      prisma.financeRecurringBill.count({ where: { memberId: m.id, familyId: user.familyId } }),
      prisma.financeIncomeEntry.count({ where: { memberId: m.id, familyId: user.familyId } }),
      prisma.financeTransaction.count({ where: { memberId: m.id, familyId: user.familyId } }),
    ])
    return { ...m, _count: { bills, income, transactions } }
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { email, name } = json

  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
  }

  // Find existing user by email (stored lowercased — see register route) —
  // if they already belong to this family, skip
  const normalizedEmail = String(email).toLowerCase().trim()
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing && existing.familyId === user.familyId) {
    return NextResponse.json({ error: 'Member already exists in this family' }, { status: 409 })
  }

  // If user exists but in another family, disallow
  if (existing && existing.familyId !== user.familyId) {
    return NextResponse.json(
      { error: 'A user with this email already belongs to another family' },
      { status: 409 }
    )
  }

  // If user exists without a family, assign them
  if (existing && !existing.familyId) {
    const member = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { familyId: user.familyId, name },
      select: { id: true, name: true, email: true },
    })
    return NextResponse.json(member, { status: 200 })
  }

  // User doesn't exist — they need to sign up through the auth flow
  return NextResponse.json(
    { error: 'User not found. They must sign up first through the login page.' },
    { status: 404 }
  )
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, name } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.user.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const member = await prisma.user.update({
    where: { id },
    data: { name },
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json(member)
}