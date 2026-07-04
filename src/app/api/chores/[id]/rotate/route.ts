import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { nextAssigneeId } from '@/lib/chore-completion'

async function _POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // Verify chore exists and belongs to family
  const chore = await prisma.chore.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      currentAssignee: { select: { id: true, name: true } },
    },
  })
  if (!chore) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Get all family members for rotation
  const members = await prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { id: true },
    orderBy: { name: 'asc' },
  })

  if (members.length === 0) {
    return NextResponse.json({ error: 'No family members to rotate to' }, { status: 400 })
  }

  // Find next assignee using the shared rotation helper.
  const next = nextAssigneeId(chore.currentAssigneeId, members)

  const updated = await prisma.chore.update({
    where: { id },
    data: { currentAssigneeId: next },
    include: {
      currentAssignee: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(updated)
}

export const POST = withRouteErrors(_POST)
