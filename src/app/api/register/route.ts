import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { enforceIpRateLimit } from '@/lib/rate-limit'

class InviteAlreadyUsedError extends Error {}

async function _POST(req: Request) {
  const limited = enforceIpRateLimit(req, 'register', 5, 15 * 60 * 1000)
  if (limited) return limited

  const { email, password, name, familyName, inviteCode } = await req.json()

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Store lowercased+trimmed so the password-reset and login lookups (which
  // normalise the same way) always match what was registered.
  const normalizedEmail = String(email).toLowerCase().trim()

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const familyCount = await prisma.family.count()
  const isFirstUser = familyCount === 0

  if (!isFirstUser && !inviteCode) {
    return NextResponse.json({ error: 'Invite code required' }, { status: 403 })
  }

  const hashed = await bcrypt.hash(password, 12)

  try {
    if (isFirstUser) {
      if (!familyName) {
        return NextResponse.json({ error: 'Family name required for first user' }, { status: 400 })
      }
      const family = await prisma.family.create({ data: { name: familyName } })
      await prisma.user.create({
        data: { email: normalizedEmail, password: hashed, name, role: 'admin', familyId: family.id, isSystemAdmin: true },
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

    // Claim the invite atomically (used: false → true) in the same transaction
    // as the user create, so two concurrent registers with the same code
    // cannot both pass the check above and both consume it.
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.inviteCode.updateMany({
        where: { code: inviteCode, used: false },
        data: { used: true },
      })
      if (claimed.count === 0) throw new InviteAlreadyUsedError()
      const user = await tx.user.create({
        data: { email: normalizedEmail, password: hashed, name, role, familyId: invite.familyId },
      })
      await tx.inviteCode.update({ where: { code: inviteCode }, data: { usedBy: user.id } })
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof InviteAlreadyUsedError) {
      return NextResponse.json({ error: 'Invalid or used invite code' }, { status: 403 })
    }
    // Unique-email race past the check above; the transaction rolls back so
    // the invite is not burned.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }
    throw err
  }
}

export const POST = withRouteErrors(_POST)
