import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSystemAdmin } from '@/lib/auth-helpers'
import { generateCode } from '@/lib/invite'

async function _POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireSystemAdmin()
  if (check instanceof NextResponse) return check

  const { id } = await params

  const family = await prisma.family.findUnique({ where: { id }, select: { id: true } })
  if (!family) {
    return NextResponse.json({ error: 'Family not found' }, { status: 404 })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await prisma.inviteCode.create({
    data: { code, familyId: id, expiresAt, isAdminInvite: false },
  })

  return NextResponse.json({ inviteCode: code })
}

export const POST = withRouteErrors(_POST)
