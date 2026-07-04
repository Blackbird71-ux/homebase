import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSystemAdmin } from '@/lib/auth-helpers'
import bcrypt from 'bcryptjs'

async function _POST(req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const check = await requireSystemAdmin()
  if (check instanceof NextResponse) return check

  const { id, userId } = await params
  const { newPassword } = await req.json()

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, familyId: id },
    select: { id: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found in this family' }, { status: 404 })
  }

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } })

  return NextResponse.json({ success: true })
}

export const POST = withRouteErrors(_POST)
