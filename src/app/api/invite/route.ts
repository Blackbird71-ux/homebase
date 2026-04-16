import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth-helpers'
import { generateCode } from '@/lib/invite'

// POST — generate a new invite code (admin only)
export async function POST() {
  const user = await requireAdmin()

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const invite = await prisma.inviteCode.create({
    data: { code, familyId: user.familyId, expiresAt },
  })

  return NextResponse.json({ code: invite.code, expiresAt: invite.expiresAt })
}

// GET — list all invite codes for the family (admin only)
export async function GET() {
  const user = await requireAdmin()

  const codes = await prisma.inviteCode.findMany({
    where: { familyId: user.familyId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(codes)
}
