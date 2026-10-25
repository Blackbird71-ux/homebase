import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { bulkUpdateListItems } from '@/lib/list-bulk'
import { BULK_MAX_IDS, parseBulkChange } from '@/lib/list-bulk-helpers'

async function _POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  const ids: unknown = body?.ids
  const change = parseBulkChange(body?.change)
  if (
    !Array.isArray(ids) || ids.length === 0 || ids.length > BULK_MAX_IDS ||
    !ids.every((i) => typeof i === 'string') || !change
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const list = await prisma.list.findFirst({ where: { id, familyId: user.familyId } })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await bulkUpdateListItems(id, ids as string[], change)

  if (change.type === 'delete' && result.changed > 0) {
    void createAuditLog(
      user, 'delete', 'listItem', id,
      `Deleted ${result.changed} items from list "${list.name}"`,
      { listId: id, listName: list.name, count: result.changed },
    )
  }
  revalidatePath('/lists')
  return NextResponse.json(result)
}

export const POST = withRouteErrors(_POST)
