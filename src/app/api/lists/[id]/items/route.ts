import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { jsonWithETag } from '@/lib/http-cache'

async function _GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return jsonWithETag(req, list.items)
}

async function _POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { content, category, dueDate, sortOrder, recipeId, recipeName, unitPrice, quantity, assignedToUserId, clientMutationId } = body

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const parsed = dueDate ? new Date(dueDate) : null
  if (parsed !== null && isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'dueDate is not a valid ISO date' }, { status: 400 })
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Validate assignedToUserId if provided — must be a family member.
  if (assignedToUserId) {
    const member = await prisma.user.findFirst({
      where: { id: assignedToUserId, familyId: user.familyId },
    })
    if (!member) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    }
  }

  // Idempotent offline-replay guard: if this create was already committed under the
  // same clientMutationId (response lost on a flaky reconnect), return the existing
  // row instead of duplicating it. Skip the audit log on this path.
  if (clientMutationId) {
    const existing = await prisma.listItem.findUnique({ where: { clientMutationId } })
    if (existing) return NextResponse.json(existing, { status: 200 })
  }

  const item = await prisma.listItem.create({
    data: {
      content,
      category: category ?? null,
      dueDate: parsed,
      sortOrder: sortOrder ?? 0,
      recipeId: recipeId ?? null,
      recipeName: recipeName ?? null,
      unitPrice: unitPrice ?? null,
      quantity: quantity ?? null,
      assignedToUserId: assignedToUserId ?? null,
      clientMutationId: clientMutationId ?? null,
      createdBy: user.id,
      listId: id,
    },
  })

  void createAuditLog(
    user,
    'create',
    'listItem',
    item.id,
    `Added "${content}" to list "${list.name}"`,
    { item: { content, category, listId: id, listName: list.name } }
  )

  return NextResponse.json(item, { status: 201 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
