import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const { email, password, name, familyName, inviteCode } = await req.json()

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const familyCount = await prisma.family.count()
  const isFirstUser = familyCount === 0

  if (!isFirstUser && !inviteCode) {
    return NextResponse.json({ error: 'Invite code required' }, { status: 403 })
  }

  const hashed = await bcrypt.hash(password, 12)

  if (isFirstUser) {
    if (!familyName) {
      return NextResponse.json({ error: 'Family name required for first user' }, { status: 400 })
    }
    const family = await prisma.family.create({ data: { name: familyName } })
    await prisma.user.create({
      data: { email, password: hashed, name, role: 'admin', familyId: family.id, isSystemAdmin: true },
    })
    return NextResponse.json({ success: true })
  }

  // Validate invite code
  const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } })
  if (!invite || invite.used) {
    return NextResponse.json({ error: 'Invalid or used invite code' }, { status: 403 })
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invite code expired' }, { status: 403 })
  }

  const role = invite.isAdminInvite ? 'admin' : 'member'

  const user = await prisma.user.create({
    data: { email, password: hashed, name, role, familyId: invite.familyId },
  })
  await prisma.inviteCode.update({
    where: { code: inviteCode },
    data: { used: true, usedBy: user.id },
  })

  return NextResponse.json({ success: true })
}
