import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  
  // Verify the mapping belongs to the user's family
  const mapping = await prisma.ingredientMapping.findFirst({
    where: { id, familyId: user.familyId },
  })
  
  if (!mapping) {
    return NextResponse.json(
      { error: 'Mapping not found' },
      { status: 404 }
    )
  }
  
  await prisma.ingredientMapping.delete({
    where: { id },
  })
  
  return NextResponse.json({ success: true })
}

export const DELETE = withRouteErrors(_DELETE)
