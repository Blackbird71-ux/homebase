import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const members = await prisma.user.findMany({
    where: { familyId: session.familyId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(members)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { email, name } = json

  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
  }

  // Find existing user by email — if they already belong to this family, skip
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing && existing.familyId === session.familyId) {
    return NextResponse.json({ error: 'Member already exists in this family' }, { status: 409 })
  }

  // If user exists but in another family, disallow
  if (existing && existing.familyId !== session.familyId) {
    return NextResponse.json(
      { error: 'A user with this email already belongs to another family' },
      { status: 409 }
    )
  }

  // If user exists without a family, assign them
  if (existing && !existing.familyId) {
    const member = await prisma.user.update({
      where: { email },
      data: { familyId: session.familyId, name },
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
  const session = await requireSession()
  const json = await request.json()
  const { id, name } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.user.findFirst({
    where: { id, familyId: session.familyId },
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