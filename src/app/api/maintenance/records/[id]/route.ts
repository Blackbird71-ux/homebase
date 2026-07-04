import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const record = await prisma.maintenanceRecord.findUnique({ where: { id } })
  if (!record || record.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.maintenanceRecord.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

export const DELETE = withRouteErrors(_DELETE)
