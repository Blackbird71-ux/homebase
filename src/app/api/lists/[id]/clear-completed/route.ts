import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count } = await prisma.listItem.deleteMany({
    where: { listId: id, isCompleted: true, isLocked: false },
  })
  revalidatePath('/lists')
  return NextResponse.json({ deleted: count })
}

export const POST = withRouteErrors(_POST)
